from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import base64
import os
import httpx
import uuid
import jwt
import logging
import sys
from jwt import PyJWKClient
from datetime import datetime, timedelta
from dotenv import load_dotenv
from azure.identity import DefaultAzureCredential
from azure.cosmos import CosmosClient, PartitionKey, exceptions
from azure.storage.blob import BlobServiceClient, ContentSettings, generate_blob_sas, BlobSasPermissions, UserDelegationKey

# Configure logging to stdout for Azure App Service
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("aiflix")
logger.setLevel(logging.DEBUG)

load_dotenv()

app = FastAPI(title="AiFlix API")

# === JWT Token Validation ===
FRONTEND_TENANT_ID = os.getenv("FRONTEND_TENANT_ID", "72f988bf-86f1-41af-91ab-2d7cd011db47")
FRONTEND_CLIENT_ID = os.getenv("FRONTEND_CLIENT_ID", "9fa938f7-171c-406d-ab2b-b72279ead74e")
JWKS_URL = f"https://login.microsoftonline.com/{FRONTEND_TENANT_ID}/discovery/v2.0/keys"
AUTH_ENABLED = os.getenv("AUTH_ENABLED", "true").lower() == "true"

logger.info("=== JWT Auth Configuration ===")
logger.info(f"AUTH_ENABLED: {AUTH_ENABLED}")
logger.info(f"FRONTEND_TENANT_ID: {FRONTEND_TENANT_ID}")
logger.info(f"FRONTEND_CLIENT_ID: {FRONTEND_CLIENT_ID}")
logger.info(f"JWKS_URL: {JWKS_URL}")
logger.info("==============================")

# Cache the JWK client
jwks_client = None

def get_jwks_client():
    global jwks_client
    if jwks_client is None:
        jwks_client = PyJWKClient(JWKS_URL)
    return jwks_client

async def validate_token(request: Request):
    """Validate JWT token from frontend's Azure AD."""
    # Skip auth for health check and local development
    if request.url.path == "/health":
        return None
    
    # Allow unauthenticated in development
    auth_enabled = os.getenv("AUTH_ENABLED", "true").lower() == "true"
    if not auth_enabled:
        return None
    
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    
    token = auth_header.split(" ")[1]
    
    try:
        # Get the signing key from Azure AD
        signing_key = get_jwks_client().get_signing_key_from_jwt(token)
        
        # Decode and validate the token
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=FRONTEND_CLIENT_ID,
            issuer=f"https://login.microsoftonline.com/{FRONTEND_TENANT_ID}/v2.0"
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")

# Auth middleware for API routes
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        logger.debug(f"AUTH - Request: {request.method} {request.url.path}")
        
        # Skip auth for non-API routes and health check
        if not request.url.path.startswith("/api") or request.url.path == "/health":
            logger.debug("AUTH - Skipping auth (non-API or health)")
            return await call_next(request)
        
        # Skip auth in development
        auth_enabled = os.getenv("AUTH_ENABLED", "true").lower() == "true"
        if not auth_enabled:
            logger.debug("AUTH - Skipping auth (AUTH_ENABLED=false)")
            return await call_next(request)
        
        # Handle CORS preflight
        if request.method == "OPTIONS":
            logger.debug("AUTH - Skipping auth (OPTIONS preflight)")
            return await call_next(request)
        
        auth_header = request.headers.get("Authorization")
        logger.info(f"AUTH - Authorization header present: {bool(auth_header)}")
        if auth_header:
            logger.debug(f"AUTH - Authorization header prefix: {auth_header[:50]}...")
        
        if not auth_header or not auth_header.startswith("Bearer "):
            logger.warning("AUTH - REJECTED: Missing or invalid Authorization header")
            return JSONResponse(status_code=401, content={"detail": "Missing or invalid Authorization header"})
        
        token = auth_header.split(" ")[1]
        logger.debug(f"AUTH - Token length: {len(token)}")
        logger.debug(f"AUTH - Token prefix: {token[:50]}...")
        
        try:
            logger.debug(f"AUTH - Fetching signing key from JWKS: {JWKS_URL}")
            signing_key = get_jwks_client().get_signing_key_from_jwt(token)
            logger.debug("AUTH - Got signing key, validating token...")
            logger.debug(f"AUTH - Expected audience: {FRONTEND_CLIENT_ID}")
            logger.debug(f"AUTH - Expected issuer: https://login.microsoftonline.com/{FRONTEND_TENANT_ID}/v2.0")
            
            decoded = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                audience=FRONTEND_CLIENT_ID,
                issuer=f"https://login.microsoftonline.com/{FRONTEND_TENANT_ID}/v2.0"
            )
            logger.info("AUTH - Token validated successfully!")
            logger.debug(f"AUTH - Token sub: {decoded.get('sub')}")
            logger.debug(f"AUTH - Token aud: {decoded.get('aud')}")
            logger.debug(f"AUTH - Token iss: {decoded.get('iss')}")
        except jwt.ExpiredSignatureError:
            logger.warning("AUTH - REJECTED: Token expired")
            return JSONResponse(status_code=401, content={"detail": "Token has expired"})
        except jwt.InvalidTokenError as e:
            logger.warning(f"AUTH - REJECTED: Invalid token - {str(e)}")
            return JSONResponse(status_code=401, content={"detail": f"Invalid token: {str(e)}"})
        except Exception as e:
            logger.error(f"AUTH - REJECTED: Exception - {str(e)}", exc_info=True)
            return JSONResponse(status_code=401, content={"detail": f"Authentication failed: {str(e)}"})
        
        return await call_next(request)

# Add AuthMiddleware first, then CORS wraps it (middleware order is reversed)
app.add_middleware(AuthMiddleware)

# CORS middleware for React frontend - added after auth so it wraps auth responses
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "https://aiflix-dev.azurewebsites.net"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# === Models ===

class ImageGenerationRequest(BaseModel):
    asset_name: str
    asset_description: str

class ImageGenerationResponse(BaseModel):
    image_data: str  # Base64 encoded image
    content_type: str

class AssetCreate(BaseModel):
    assetName: str
    assetDescription: str
    primaryCustomerScenario: Optional[str] = None
    createdBy: str
    tags: List[str] = []
    architectureUrl: Optional[str] = None
    presentationUrl: Optional[str] = None
    githubUrl: Optional[str] = None
    liveDemoUrl: Optional[str] = None
    recordingUrl: Optional[str] = None
    assetPicture: Optional[str] = None  # Base64 image data
    screenshots: List[str] = []

class Asset(BaseModel):
    id: str
    assetName: str
    assetDescription: str
    primaryCustomerScenario: Optional[str] = None
    createdBy: str
    tags: List[str] = []
    architectureUrl: Optional[str] = None
    presentationUrl: Optional[str] = None
    githubUrl: Optional[str] = None
    liveDemoUrl: Optional[str] = None
    recordingUrl: Optional[str] = None
    assetPicture: Optional[str] = None
    screenshots: List[str] = []
    createdAt: str
    lastMaintainedAt: Optional[str] = None
    averageRating: Optional[float] = None
    ratingCount: Optional[int] = 0

class RatingCreate(BaseModel):
    rating: int  # 1-5 stars
    userId: str
    userName: str

class Rating(BaseModel):
    id: str
    assetId: str
    rating: int
    userId: str
    userName: str
    createdAt: str

class CommentCreate(BaseModel):
    text: str
    userId: str
    userName: str

class Comment(BaseModel):
    id: str
    assetId: str
    text: str
    userId: str
    userName: str
    createdAt: str

class AssetPictureUpdate(BaseModel):
    assetPicture: str

class AssetUpdate(BaseModel):
    assetName: Optional[str] = None
    assetDescription: Optional[str] = None
    primaryCustomerScenario: Optional[str] = None
    tags: Optional[List[str]] = None
    architectureUrl: Optional[str] = None
    presentationUrl: Optional[str] = None
    githubUrl: Optional[str] = None
    liveDemoUrl: Optional[str] = None
    recordingUrl: Optional[str] = None
    assetPicture: Optional[str] = None
    screenshots: Optional[List[str]] = None

class ImprovementCreate(BaseModel):
    type: str  # deployment, architecture, demoflow, screenshots, slides, setup
    contributorId: str
    contributorName: str
    data: dict  # Flexible data based on improvement type

class Improvement(BaseModel):
    id: str
    assetId: str
    type: str
    contributorId: str
    contributorName: str
    data: dict
    createdAt: str

# === Azure Configuration ===

# Azure AI Foundry configuration (uses managed identity)
AZURE_OPENAI_ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT")
AZURE_OPENAI_DEPLOYMENT = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-image-1")

# Cognitive Services scope for Azure OpenAI token
COGNITIVE_SERVICES_SCOPE = "https://cognitiveservices.azure.com/.default"

# Cosmos DB configuration (uses managed identity)
COSMOS_ENDPOINT = os.getenv("COSMOS_ENDPOINT")
COSMOS_DATABASE = os.getenv("COSMOS_DATABASE", "aiflix")
COSMOS_CONTAINER = os.getenv("COSMOS_CONTAINER", "assets")

# Azure Blob Storage configuration (uses managed identity)
BLOB_ACCOUNT_URL = os.getenv("BLOB_ACCOUNT_URL")  # e.g., https://<account>.blob.core.windows.net
BLOB_CONTAINER_NAME = os.getenv("BLOB_CONTAINER_NAME", "asset-images")

# Shared credential for all Azure services
azure_credential = None

def get_azure_credential():
    """Get or create the DefaultAzureCredential for managed identity."""
    global azure_credential
    if azure_credential is None:
        azure_credential = DefaultAzureCredential()
    return azure_credential

# Initialize Cosmos DB client
cosmos_client = None
database = None
container = None
ratings_container = None
comments_container = None
improvements_container = None

# Initialize Blob Storage client
blob_service_client = None
blob_container_client = None
blob_account_name = None
user_delegation_key = None
user_delegation_key_expiry = None

def init_blob_storage():
    global blob_service_client, blob_container_client, blob_account_name
    if BLOB_ACCOUNT_URL:
        try:
            credential = get_azure_credential()
            blob_service_client = BlobServiceClient(BLOB_ACCOUNT_URL, credential=credential)
            blob_container_client = blob_service_client.get_container_client(BLOB_CONTAINER_NAME)
            
            # Extract account name from URL
            # URL format: https://<account>.blob.core.windows.net
            blob_account_name = BLOB_ACCOUNT_URL.replace("https://", "").split(".")[0]
            
            # Create container if it doesn't exist (without public access)
            if not blob_container_client.exists():
                blob_container_client.create_container()
            logger.info(f"Connected to Blob Storage (managed identity): {BLOB_CONTAINER_NAME}")
        except Exception as e:
            logger.info(f"Failed to connect to Blob Storage: {e}")
    else:
        logger.info("Blob Storage account URL not configured")

def get_user_delegation_key():
    """Get or refresh user delegation key for SAS token generation."""
    global user_delegation_key, user_delegation_key_expiry
    
    now = datetime.utcnow()
    # Refresh key if it doesn't exist or will expire in less than 1 hour
    if user_delegation_key is None or user_delegation_key_expiry is None or user_delegation_key_expiry < now + timedelta(hours=1):
        # Key valid for 7 days
        key_start = now - timedelta(minutes=5)  # Account for clock skew
        key_expiry = now + timedelta(days=7)
        user_delegation_key = blob_service_client.get_user_delegation_key(
            key_start_time=key_start,
            key_expiry_time=key_expiry
        )
        user_delegation_key_expiry = key_expiry
        logger.info(f"Refreshed user delegation key, expires: {key_expiry}")
    
    return user_delegation_key

def upload_image_to_blob(image_base64: str, filename: str) -> str:
    """Upload base64 image to Blob Storage and return URL with User Delegation SAS token."""
    if not blob_container_client:
        raise Exception("Blob Storage not configured")
    
    # Decode base64 image
    # Handle data URL format (data:image/png;base64,...)
    if "," in image_base64:
        image_base64 = image_base64.split(",")[1]
    
    image_data = base64.b64decode(image_base64)
    
    # Upload to blob
    blob_client = blob_container_client.get_blob_client(filename)
    blob_client.upload_blob(
        image_data, 
        overwrite=True,
        content_settings=ContentSettings(content_type="image/png")
    )
    
    # Generate User Delegation SAS token for read access (valid for 1 year)
    delegation_key = get_user_delegation_key()
    sas_token = generate_blob_sas(
        account_name=blob_account_name,
        container_name=BLOB_CONTAINER_NAME,
        blob_name=filename,
        user_delegation_key=delegation_key,
        permission=BlobSasPermissions(read=True),
        expiry=datetime.utcnow() + timedelta(days=365)
    )
    
    return f"{blob_client.url}?{sas_token}"

def init_cosmos():
    global cosmos_client, database, container, ratings_container, comments_container, improvements_container
    logger.info(f"DEBUG - COSMOS_ENDPOINT: {COSMOS_ENDPOINT}")
    logger.info(f"DEBUG - COSMOS_DATABASE: {COSMOS_DATABASE}")
    logger.info(f"DEBUG - COSMOS_CONTAINER: {COSMOS_CONTAINER}")
    if COSMOS_ENDPOINT:
        try:
            credential = get_azure_credential()
            cosmos_client = CosmosClient(COSMOS_ENDPOINT, credential=credential)
            database = cosmos_client.create_database_if_not_exists(id=COSMOS_DATABASE)
            # Note: No offer_throughput for serverless Cosmos DB accounts
            container = database.create_container_if_not_exists(
                id=COSMOS_CONTAINER,
                partition_key=PartitionKey(path="/createdBy")
            )
            # Ratings container - partitioned by assetId
            ratings_container = database.create_container_if_not_exists(
                id="ratings",
                partition_key=PartitionKey(path="/assetId")
            )
            # Comments container - partitioned by assetId
            comments_container = database.create_container_if_not_exists(
                id="comments",
                partition_key=PartitionKey(path="/assetId")
            )
            # Improvements container - partitioned by assetId
            improvements_container = database.create_container_if_not_exists(
                id="improvements",
                partition_key=PartitionKey(path="/assetId")
            )
            logger.info(f"Connected to Cosmos DB (managed identity): {COSMOS_DATABASE}/{COSMOS_CONTAINER}")
        except Exception as e:
            logger.info(f"Failed to connect to Cosmos DB: {e}")
            import traceback
            traceback.print_exc()
    else:
        logger.info("Cosmos DB endpoint not configured")

# Initialize on startup
init_cosmos()
init_blob_storage()

@app.get("/health")
async def health_check():
    """Health check that verifies managed identity access to all services."""
    health_status = {
        "status": "healthy",
        "services": {
            "cosmos_db": {"configured": False, "connected": False, "error": None},
            "blob_storage": {"configured": False, "connected": False, "error": None},
            "azure_openai": {"configured": False, "connected": False, "error": None}
        }
    }
    
    # Check Cosmos DB - verify we can read from the database
    if COSMOS_ENDPOINT:
        health_status["services"]["cosmos_db"]["configured"] = True
        if container:
            try:
                # Try to read database properties to verify managed identity access
                list(container.query_items(query="SELECT VALUE COUNT(1) FROM c", enable_cross_partition_query=True, max_item_count=1))
                health_status["services"]["cosmos_db"]["connected"] = True
            except Exception as e:
                health_status["services"]["cosmos_db"]["error"] = str(e)
                health_status["status"] = "degraded"
    
    # Check Blob Storage - verify we can access the container
    if BLOB_ACCOUNT_URL:
        health_status["services"]["blob_storage"]["configured"] = True
        if blob_container_client:
            try:
                # Try to check container properties to verify managed identity access
                blob_container_client.get_container_properties()
                health_status["services"]["blob_storage"]["connected"] = True
            except Exception as e:
                health_status["services"]["blob_storage"]["error"] = str(e)
                health_status["status"] = "degraded"
    
    # Check Azure OpenAI - verify we can get a token
    if AZURE_OPENAI_ENDPOINT:
        health_status["services"]["azure_openai"]["configured"] = True
        try:
            # Try to get a token to verify managed identity has Cognitive Services access
            credential = get_azure_credential()
            token = credential.get_token(COGNITIVE_SERVICES_SCOPE)
            if token:
                health_status["services"]["azure_openai"]["connected"] = True
        except Exception as e:
            health_status["services"]["azure_openai"]["error"] = str(e)
            health_status["status"] = "degraded"
    
    # Set overall status to unhealthy if no services are connected
    all_disconnected = not any(svc["connected"] for svc in health_status["services"].values())
    if all_disconnected and any(svc["configured"] for svc in health_status["services"].values()):
        health_status["status"] = "unhealthy"
    
    return health_status

# === Asset CRUD Endpoints ===

@app.post("/api/assets", response_model=Asset)
async def create_asset(asset: AssetCreate):
    """Create a new asset in Cosmos DB with images stored in Blob Storage."""
    if not container:
        raise HTTPException(status_code=500, detail="Cosmos DB not configured")
    
    asset_id = str(uuid.uuid4())
    asset_picture_url = None
    screenshot_urls = []
    
    # Upload main asset picture to Blob Storage
    if asset.assetPicture and blob_container_client:
        try:
            filename = f"{asset_id}/main.png"
            asset_picture_url = upload_image_to_blob(asset.assetPicture, filename)
        except Exception as e:
            logger.info(f"Failed to upload asset picture: {e}")
            # Fall back to storing base64 if blob upload fails
            asset_picture_url = asset.assetPicture
    elif asset.assetPicture:
        # No blob storage configured, store base64
        asset_picture_url = asset.assetPicture
    
    # Upload screenshots to Blob Storage
    if asset.screenshots and blob_container_client:
        for i, screenshot in enumerate(asset.screenshots):
            try:
                filename = f"{asset_id}/screenshot_{i}.png"
                url = upload_image_to_blob(screenshot, filename)
                screenshot_urls.append(url)
            except Exception as e:
                logger.info(f"Failed to upload screenshot {i}: {e}")
                screenshot_urls.append(screenshot)  # Fall back to base64
    else:
        screenshot_urls = asset.screenshots
    
    asset_doc = {
        "id": asset_id,
        "assetName": asset.assetName,
        "assetDescription": asset.assetDescription,
        "primaryCustomerScenario": asset.primaryCustomerScenario,
        "createdBy": asset.createdBy,
        "tags": asset.tags,
        "architectureUrl": asset.architectureUrl,
        "presentationUrl": asset.presentationUrl,
        "githubUrl": asset.githubUrl,
        "liveDemoUrl": asset.liveDemoUrl,
        "recordingUrl": asset.recordingUrl,
        "assetPicture": asset_picture_url,
        "screenshots": screenshot_urls,
        "createdAt": datetime.utcnow().isoformat(),
        "lastMaintainedAt": datetime.utcnow().isoformat()
    }
    
    try:
        result = container.create_item(body=asset_doc)
        return Asset(**result)
    except exceptions.CosmosHttpResponseError as e:
        raise HTTPException(status_code=500, detail=f"Failed to create asset: {str(e)}")

@app.get("/api/assets", response_model=List[Asset])
async def get_assets():
    """Get all assets from Cosmos DB."""
    if not container:
        raise HTTPException(status_code=500, detail="Cosmos DB not configured")
    
    try:
        query = "SELECT * FROM c ORDER BY c.createdAt DESC"
        items = list(container.query_items(query=query, enable_cross_partition_query=True))
        return [Asset(**item) for item in items]
    except exceptions.CosmosHttpResponseError as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch assets: {str(e)}")

@app.get("/api/assets/{asset_id}", response_model=Asset)
async def get_asset(asset_id: str):
    """Get a single asset by ID."""
    if not container:
        raise HTTPException(status_code=500, detail="Cosmos DB not configured")
    
    try:
        query = f"SELECT * FROM c WHERE c.id = @id"
        params = [{"name": "@id", "value": asset_id}]
        items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
        if not items:
            raise HTTPException(status_code=404, detail="Asset not found")
        
        asset = items[0]
        
        # Get average rating for this asset
        if ratings_container:
            rating_query = "SELECT VALUE AVG(c.rating) FROM c WHERE c.assetId = @assetId"
            rating_params = [{"name": "@assetId", "value": asset_id}]
            avg_ratings = list(ratings_container.query_items(query=rating_query, parameters=rating_params, enable_cross_partition_query=True))
            
            count_query = "SELECT VALUE COUNT(1) FROM c WHERE c.assetId = @assetId"
            count_result = list(ratings_container.query_items(query=count_query, parameters=rating_params, enable_cross_partition_query=True))
            
            asset["averageRating"] = avg_ratings[0] if avg_ratings and avg_ratings[0] else None
            asset["ratingCount"] = count_result[0] if count_result else 0
        
        return Asset(**asset)
    except exceptions.CosmosHttpResponseError as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch asset: {str(e)}")

@app.patch("/api/assets/{asset_id}/picture", response_model=Asset)
async def update_asset_picture(asset_id: str, picture_update: AssetPictureUpdate):
    """Update an asset's picture."""
    if not container:
        raise HTTPException(status_code=500, detail="Cosmos DB not configured")
    
    try:
        # Get the existing asset
        query = f"SELECT * FROM c WHERE c.id = @id"
        params = [{"name": "@id", "value": asset_id}]
        items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
        if not items:
            raise HTTPException(status_code=404, detail="Asset not found")
        
        asset = items[0]
        
        # Upload the image to blob storage if configured
        asset_picture_url = picture_update.assetPicture
        if blob_service_client and picture_update.assetPicture and picture_update.assetPicture.startswith('data:'):
            try:
                filename = f"{asset_id}_cover.png"
                asset_picture_url = upload_image_to_blob(picture_update.assetPicture, filename)
            except Exception as e:
                logger.info(f"Failed to upload image to blob: {e}")
                # Fall back to base64
        
        # Update the asset
        asset["assetPicture"] = asset_picture_url
        
        # Replace the item in Cosmos DB
        result = container.replace_item(item=asset_id, body=asset)
        return Asset(**result)
    except exceptions.CosmosHttpResponseError as e:
        raise HTTPException(status_code=500, detail=f"Failed to update asset picture: {str(e)}")

@app.put("/api/assets/{asset_id}", response_model=Asset)
async def update_asset(asset_id: str, asset_update: AssetUpdate):
    """Update an asset's details."""
    if not container:
        raise HTTPException(status_code=500, detail="Cosmos DB not configured")
    
    try:
        # Get the existing asset
        query = f"SELECT * FROM c WHERE c.id = @id"
        params = [{"name": "@id", "value": asset_id}]
        items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
        if not items:
            raise HTTPException(status_code=404, detail="Asset not found")
        
        asset = items[0]
        
        # Update only provided fields
        update_data = asset_update.model_dump(exclude_unset=True)
        
        # Handle image upload if provided as base64
        if 'assetPicture' in update_data and update_data['assetPicture']:
            if blob_service_client and update_data['assetPicture'].startswith('data:'):
                try:
                    filename = f"{asset_id}_cover.png"
                    update_data['assetPicture'] = upload_image_to_blob(update_data['assetPicture'], filename)
                except Exception as e:
                    logger.info(f"Failed to upload image to blob: {e}")
        
        for key, value in update_data.items():
            asset[key] = value
        
        # Update lastMaintainedAt when owner edits the asset
        asset["lastMaintainedAt"] = datetime.utcnow().isoformat()
        
        # Replace the item in Cosmos DB
        result = container.replace_item(item=asset_id, body=asset)
        return Asset(**result)
    except exceptions.CosmosHttpResponseError as e:
        raise HTTPException(status_code=500, detail=f"Failed to update asset: {str(e)}")

@app.delete("/api/assets/{asset_id}")
async def delete_asset(asset_id: str):
    """Delete an asset and its associated data."""
    if not container:
        raise HTTPException(status_code=500, detail="Cosmos DB not configured")
    
    try:
        # Get the existing asset
        query = f"SELECT * FROM c WHERE c.id = @id"
        params = [{"name": "@id", "value": asset_id}]
        items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
        if not items:
            raise HTTPException(status_code=404, detail="Asset not found")
        
        asset = items[0]
        
        # Delete associated ratings
        if ratings_container:
            try:
                rating_query = "SELECT * FROM c WHERE c.assetId = @assetId"
                rating_params = [{"name": "@assetId", "value": asset_id}]
                ratings = list(ratings_container.query_items(query=rating_query, parameters=rating_params, enable_cross_partition_query=True))
                for rating in ratings:
                    ratings_container.delete_item(item=rating['id'], partition_key=rating['assetId'])
            except Exception as e:
                logger.info(f"Failed to delete ratings: {e}")
        
        # Delete associated comments
        if comments_container:
            try:
                comment_query = "SELECT * FROM c WHERE c.assetId = @assetId"
                comment_params = [{"name": "@assetId", "value": asset_id}]
                comments = list(comments_container.query_items(query=comment_query, parameters=comment_params, enable_cross_partition_query=True))
                for comment in comments:
                    comments_container.delete_item(item=comment['id'], partition_key=comment['assetId'])
            except Exception as e:
                logger.info(f"Failed to delete comments: {e}")
        
        # Delete asset image from blob storage if exists
        if blob_service_client and asset.get('assetPicture') and 'blob.core.windows.net' in asset.get('assetPicture', ''):
            try:
                blob_container_client = blob_service_client.get_container_client(os.getenv('BLOB_CONTAINER_NAME', 'assets'))
                blob_name = f"{asset_id}_cover.png"
                blob_container_client.delete_blob(blob_name)
            except Exception as e:
                logger.info(f"Failed to delete blob: {e}")
        
        # Delete the asset
        container.delete_item(item=asset_id, partition_key=asset['createdBy'])
        
        return {"message": "Asset deleted successfully"}
    except exceptions.CosmosHttpResponseError as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete asset: {str(e)}")

# === Rating Endpoints ===

@app.post("/api/assets/{asset_id}/ratings", response_model=Rating)
async def add_rating(asset_id: str, rating: RatingCreate):
    """Add or update a rating for an asset."""
    if not ratings_container:
        raise HTTPException(status_code=500, detail="Cosmos DB not configured")
    
    if rating.rating < 1 or rating.rating > 5:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")
    
    try:
        # Check if user already rated this asset
        query = "SELECT * FROM c WHERE c.assetId = @assetId AND c.userId = @userId"
        params = [
            {"name": "@assetId", "value": asset_id},
            {"name": "@userId", "value": rating.userId}
        ]
        existing = list(ratings_container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
        
        if existing:
            # Update existing rating
            rating_doc = existing[0]
            rating_doc["rating"] = rating.rating
            rating_doc["createdAt"] = datetime.utcnow().isoformat()
            result = ratings_container.replace_item(item=rating_doc["id"], body=rating_doc)
        else:
            # Create new rating
            rating_doc = {
                "id": str(uuid.uuid4()),
                "assetId": asset_id,
                "rating": rating.rating,
                "userId": rating.userId,
                "userName": rating.userName,
                "createdAt": datetime.utcnow().isoformat()
            }
            result = ratings_container.create_item(body=rating_doc)
        
        return Rating(**result)
    except exceptions.CosmosHttpResponseError as e:
        raise HTTPException(status_code=500, detail=f"Failed to add rating: {str(e)}")

@app.get("/api/assets/{asset_id}/ratings")
async def get_ratings(asset_id: str):
    """Get all ratings for an asset."""
    if not ratings_container:
        raise HTTPException(status_code=500, detail="Cosmos DB not configured")
    
    try:
        query = "SELECT * FROM c WHERE c.assetId = @assetId ORDER BY c.createdAt DESC"
        params = [{"name": "@assetId", "value": asset_id}]
        items = list(ratings_container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
        
        # Calculate average
        avg = sum(item["rating"] for item in items) / len(items) if items else 0
        
        return {
            "ratings": [Rating(**item) for item in items],
            "averageRating": round(avg, 1),
            "totalCount": len(items)
        }
    except exceptions.CosmosHttpResponseError as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch ratings: {str(e)}")

@app.get("/api/assets/{asset_id}/ratings/user/{user_id}")
async def get_user_rating(asset_id: str, user_id: str):
    """Get a specific user's rating for an asset."""
    if not ratings_container:
        raise HTTPException(status_code=500, detail="Cosmos DB not configured")
    
    try:
        query = "SELECT * FROM c WHERE c.assetId = @assetId AND c.userId = @userId"
        params = [
            {"name": "@assetId", "value": asset_id},
            {"name": "@userId", "value": user_id}
        ]
        items = list(ratings_container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
        
        if not items:
            return {"rating": None}
        
        return {"rating": items[0]["rating"]}
    except exceptions.CosmosHttpResponseError as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch user rating: {str(e)}")

# === Comment Endpoints ===

@app.post("/api/assets/{asset_id}/comments", response_model=Comment)
async def add_comment(asset_id: str, comment: CommentCreate):
    """Add a comment to an asset."""
    if not comments_container:
        raise HTTPException(status_code=500, detail="Cosmos DB not configured")
    
    if not comment.text.strip():
        raise HTTPException(status_code=400, detail="Comment text cannot be empty")
    
    try:
        comment_doc = {
            "id": str(uuid.uuid4()),
            "assetId": asset_id,
            "text": comment.text.strip(),
            "userId": comment.userId,
            "userName": comment.userName,
            "createdAt": datetime.utcnow().isoformat()
        }
        result = comments_container.create_item(body=comment_doc)
        return Comment(**result)
    except exceptions.CosmosHttpResponseError as e:
        raise HTTPException(status_code=500, detail=f"Failed to add comment: {str(e)}")

@app.get("/api/assets/{asset_id}/comments", response_model=List[Comment])
async def get_comments(asset_id: str):
    """Get all comments for an asset."""
    if not comments_container:
        raise HTTPException(status_code=500, detail="Cosmos DB not configured")
    
    try:
        query = "SELECT * FROM c WHERE c.assetId = @assetId ORDER BY c.createdAt DESC"
        params = [{"name": "@assetId", "value": asset_id}]
        items = list(comments_container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
        return [Comment(**item) for item in items]
    except exceptions.CosmosHttpResponseError as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch comments: {str(e)}")

@app.delete("/api/assets/{asset_id}/comments/{comment_id}")
async def delete_comment(asset_id: str, comment_id: str, user_id: str):
    """Delete a comment (only by the comment author)."""
    if not comments_container:
        raise HTTPException(status_code=500, detail="Cosmos DB not configured")
    
    try:
        # Get the comment first to verify ownership
        query = "SELECT * FROM c WHERE c.id = @id AND c.assetId = @assetId"
        params = [
            {"name": "@id", "value": comment_id},
            {"name": "@assetId", "value": asset_id}
        ]
        items = list(comments_container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
        
        if not items:
            raise HTTPException(status_code=404, detail="Comment not found")
        
        comment = items[0]
        if comment["userId"] != user_id:
            raise HTTPException(status_code=403, detail="You can only delete your own comments")
        
        comments_container.delete_item(item=comment_id, partition_key=asset_id)
        return {"message": "Comment deleted"}
    except exceptions.CosmosHttpResponseError as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete comment: {str(e)}")

# === Improvements Endpoints ===

@app.post("/api/assets/{asset_id}/improvements", response_model=Improvement)
async def create_improvement(asset_id: str, improvement: ImprovementCreate):
    """Add an improvement to an asset."""
    if not improvements_container:
        raise HTTPException(status_code=500, detail="Cosmos DB not configured")
    
    # Verify asset exists
    if container:
        try:
            query = "SELECT * FROM c WHERE c.id = @id"
            params = [{"name": "@id", "value": asset_id}]
            items = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
            if not items:
                raise HTTPException(status_code=404, detail="Asset not found")
        except exceptions.CosmosHttpResponseError:
            pass  # Allow improvement even if asset check fails
    
    try:
        improvement_doc = {
            "id": str(uuid.uuid4()),
            "assetId": asset_id,
            "type": improvement.type,
            "contributorId": improvement.contributorId,
            "contributorName": improvement.contributorName,
            "data": improvement.data,
            "createdAt": datetime.utcnow().isoformat()
        }
        result = improvements_container.create_item(body=improvement_doc)
        return Improvement(**result)
    except exceptions.CosmosHttpResponseError as e:
        raise HTTPException(status_code=500, detail=f"Failed to create improvement: {str(e)}")

@app.get("/api/assets/{asset_id}/improvements", response_model=List[Improvement])
async def get_improvements(asset_id: str):
    """Get all improvements for an asset."""
    if not improvements_container:
        raise HTTPException(status_code=500, detail="Cosmos DB not configured")
    
    try:
        query = "SELECT * FROM c WHERE c.assetId = @assetId ORDER BY c.createdAt DESC"
        params = [{"name": "@assetId", "value": asset_id}]
        items = list(improvements_container.query_items(query=query, parameters=params, enable_cross_partition_query=True))
        return [Improvement(**item) for item in items]
    except exceptions.CosmosHttpResponseError as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch improvements: {str(e)}")

# === Image Generation Endpoint ===

@app.post("/api/generate-image", response_model=ImageGenerationResponse)
async def generate_image(request: ImageGenerationRequest):
    """Generate an AI image based on asset name and description."""
    
    if not request.asset_name and not request.asset_description:
        raise HTTPException(status_code=400, detail="Asset name or description is required")
    
    # Netflix-style cinematic poster prompt
    house_style = """House Style: Cinematic streaming-poster key art. High contrast. Dramatic lighting. Clean composition. Minimal clutter. Strong central subject. Subtle gradient background. Rich color grading (teal/orange or deep blue/purple). Soft vignette. Shallow depth of field. No readable text. No logos. No watermarks.
Composition: Centered hero object/scene, with negative space at top for optional UI title overlay.
Output: Poster art, polished, premium, modern, consistent series branding."""

    prompt = f"""{house_style}

Asset Title: {request.asset_name}
Asset Description: {request.asset_description if request.asset_description else 'N/A'}
Visual Metaphors: Create visual metaphors based on the description - such as documents, checklists, magnifying glass, AI neural nodes, dashboards, shields, gavels, or other relevant imagery."""

    if not AZURE_OPENAI_ENDPOINT:
        raise HTTPException(
            status_code=500, 
            detail="Azure OpenAI endpoint not configured. Set AZURE_OPENAI_ENDPOINT environment variable."
        )
    
    try:
        # Get access token using managed identity
        credential = get_azure_credential()
        token = credential.get_token(COGNITIVE_SERVICES_SCOPE)
        
        # Azure AI Foundry OpenAI-compatible endpoint format
        url = f"{AZURE_OPENAI_ENDPOINT}/images/generations"
        
        logger.info(f"DEBUG - Calling URL: {url}")
        logger.info(f"DEBUG - Model: {AZURE_OPENAI_DEPLOYMENT}")
        
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token.token}"
        }
        
        payload = {
            "model": AZURE_OPENAI_DEPLOYMENT,
            "prompt": prompt,
            "n": 1,
            "size": "1024x1024",
            "quality": "high",        # Poster art polish - cleaner details
            "output_format": "png"    # Crisp UI assets
        }
        
        logger.info(f"DEBUG - Payload: {payload}")
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(url, json=payload, headers=headers)
            
            if response.status_code != 200:
                error_detail = response.text
                raise HTTPException(status_code=response.status_code, detail=f"Azure OpenAI error: {error_detail}")
            
            result = response.json()
            
            # Handle both URL and base64 response formats
            image_result = result["data"][0]
            if "b64_json" in image_result:
                image_data = image_result["b64_json"]
            elif "url" in image_result:
                # Fetch image from URL and convert to base64
                img_response = await client.get(image_result["url"])
                import base64
                image_data = base64.b64encode(img_response.content).decode('utf-8')
            else:
                raise HTTPException(status_code=500, detail="Unexpected response format")
            
            return ImageGenerationResponse(
                image_data=image_data,
                content_type="image/png"
            )
            
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Image generation timed out")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
