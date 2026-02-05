from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import base64
import os
import httpx
import uuid
from datetime import datetime, timedelta
from dotenv import load_dotenv
from azure.cosmos import CosmosClient, PartitionKey, exceptions
from azure.storage.blob import BlobServiceClient, ContentSettings, generate_blob_sas, BlobSasPermissions

load_dotenv()

app = FastAPI(title="AiFlix API")

# CORS middleware for React frontend
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
    createdBy: str
    tags: List[str] = []
    architectureUrl: Optional[str] = None
    presentationUrl: Optional[str] = None
    githubUrl: Optional[str] = None
    assetPicture: Optional[str] = None  # Base64 image data
    screenshots: List[str] = []

class Asset(BaseModel):
    id: str
    assetName: str
    assetDescription: str
    createdBy: str
    tags: List[str] = []
    architectureUrl: Optional[str] = None
    presentationUrl: Optional[str] = None
    githubUrl: Optional[str] = None
    assetPicture: Optional[str] = None
    screenshots: List[str] = []
    createdAt: str
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

# === Azure Configuration ===

# Azure AI Foundry configuration
AZURE_OPENAI_ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT")
AZURE_OPENAI_API_KEY = os.getenv("AZURE_OPENAI_API_KEY")
AZURE_OPENAI_DEPLOYMENT = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-image-1")

# Cosmos DB configuration
COSMOS_ENDPOINT = os.getenv("COSMOS_ENDPOINT")
COSMOS_KEY = os.getenv("COSMOS_KEY")
COSMOS_DATABASE = os.getenv("COSMOS_DATABASE", "aiflix")
COSMOS_CONTAINER = os.getenv("COSMOS_CONTAINER", "assets")

# Azure Blob Storage configuration
BLOB_CONNECTION_STRING = os.getenv("BLOB_CONNECTION_STRING")
BLOB_CONTAINER_NAME = os.getenv("BLOB_CONTAINER_NAME", "asset-images")

# Initialize Cosmos DB client
cosmos_client = None
database = None
container = None
ratings_container = None
comments_container = None

# Initialize Blob Storage client
blob_service_client = None
blob_container_client = None
blob_account_name = None
blob_account_key = None

def init_blob_storage():
    global blob_service_client, blob_container_client, blob_account_name, blob_account_key
    if BLOB_CONNECTION_STRING:
        try:
            blob_service_client = BlobServiceClient.from_connection_string(BLOB_CONNECTION_STRING)
            blob_container_client = blob_service_client.get_container_client(BLOB_CONTAINER_NAME)
            
            # Extract account name and key from connection string for SAS generation
            conn_parts = dict(part.split("=", 1) for part in BLOB_CONNECTION_STRING.split(";") if "=" in part)
            blob_account_name = conn_parts.get("AccountName")
            blob_account_key = conn_parts.get("AccountKey")
            
            # Create container if it doesn't exist (without public access)
            if not blob_container_client.exists():
                blob_container_client.create_container()
            print(f"Connected to Blob Storage: {BLOB_CONTAINER_NAME}")
        except Exception as e:
            print(f"Failed to connect to Blob Storage: {e}")
    else:
        print("Blob Storage connection string not configured")

def upload_image_to_blob(image_base64: str, filename: str) -> str:
    """Upload base64 image to Blob Storage and return URL with SAS token."""
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
    
    # Generate SAS token for read access (valid for 1 year)
    sas_token = generate_blob_sas(
        account_name=blob_account_name,
        container_name=BLOB_CONTAINER_NAME,
        blob_name=filename,
        account_key=blob_account_key,
        permission=BlobSasPermissions(read=True),
        expiry=datetime.utcnow() + timedelta(days=365)
    )
    
    return f"{blob_client.url}?{sas_token}"

def init_cosmos():
    global cosmos_client, database, container, ratings_container, comments_container
    print(f"DEBUG - COSMOS_ENDPOINT: {COSMOS_ENDPOINT}")
    print(f"DEBUG - COSMOS_KEY present: {bool(COSMOS_KEY)}")
    print(f"DEBUG - COSMOS_DATABASE: {COSMOS_DATABASE}")
    print(f"DEBUG - COSMOS_CONTAINER: {COSMOS_CONTAINER}")
    if COSMOS_ENDPOINT and COSMOS_KEY:
        try:
            cosmos_client = CosmosClient(COSMOS_ENDPOINT, COSMOS_KEY)
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
            print(f"Connected to Cosmos DB: {COSMOS_DATABASE}/{COSMOS_CONTAINER}")
        except Exception as e:
            print(f"Failed to connect to Cosmos DB: {e}")
            import traceback
            traceback.print_exc()
    else:
        print("Cosmos DB credentials not configured")

# Initialize on startup
init_cosmos()
init_blob_storage()

@app.get("/health")
async def health_check():
    return {"status": "healthy", "cosmos_connected": container is not None, "blob_connected": blob_container_client is not None}

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
            print(f"Failed to upload asset picture: {e}")
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
                print(f"Failed to upload screenshot {i}: {e}")
                screenshot_urls.append(screenshot)  # Fall back to base64
    else:
        screenshot_urls = asset.screenshots
    
    asset_doc = {
        "id": asset_id,
        "assetName": asset.assetName,
        "assetDescription": asset.assetDescription,
        "createdBy": asset.createdBy,
        "tags": asset.tags,
        "architectureUrl": asset.architectureUrl,
        "presentationUrl": asset.presentationUrl,
        "githubUrl": asset.githubUrl,
        "assetPicture": asset_picture_url,
        "screenshots": screenshot_urls,
        "createdAt": datetime.utcnow().isoformat()
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

    if not AZURE_OPENAI_ENDPOINT or not AZURE_OPENAI_API_KEY:
        raise HTTPException(
            status_code=500, 
            detail="Azure OpenAI credentials not configured. Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY environment variables."
        )
    
    try:
        # Azure AI Foundry OpenAI-compatible endpoint format
        url = f"{AZURE_OPENAI_ENDPOINT}/images/generations"
        
        print(f"DEBUG - Calling URL: {url}")
        print(f"DEBUG - Model: {AZURE_OPENAI_DEPLOYMENT}")
        
        headers = {
            "Content-Type": "application/json",
            "api-key": AZURE_OPENAI_API_KEY
        }
        
        payload = {
            "model": AZURE_OPENAI_DEPLOYMENT,
            "prompt": prompt,
            "n": 1,
            "size": "1024x1024",
            "quality": "high",        # Poster art polish - cleaner details
            "output_format": "png"    # Crisp UI assets
        }
        
        print(f"DEBUG - Payload: {payload}")
        
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
