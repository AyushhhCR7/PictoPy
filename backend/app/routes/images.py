from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import FileResponse
import os
from typing import List, Optional
from app.database.images import db_get_all_images
from app.schemas.images import ErrorResponse
from app.utils.images import image_util_parse_metadata
from pydantic import BaseModel
from app.database.images import db_toggle_image_favourite_status
from app.logging.setup_logging import get_logger

# Initialize logger
logger = get_logger(__name__)
router = APIRouter()


# Response Models
class MetadataModel(BaseModel):
    name: str
    date_created: Optional[str]
    width: int
    height: int
    file_location: str
    file_size: int
    item_type: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location: Optional[str] = None


class ImageData(BaseModel):
    id: str
    path: str
    folder_id: str
    thumbnailPath: str
    metadata: MetadataModel
    isTagged: bool
    isFavourite: bool
    tags: Optional[List[str]] = None


class GetAllImagesResponse(BaseModel):
    success: bool
    message: str
    data: List[ImageData]


@router.get(
    "/",
    response_model=GetAllImagesResponse,
    responses={500: {"model": ErrorResponse}},
)
def get_all_images(
    tagged: Optional[bool] = Query(None, description="Filter images by tagged status")
):
    """Get all images from the database."""
    try:
        # Get all images with tags from database (single query with optional filter)
        images = db_get_all_images(tagged=tagged)

        # Convert to response format
        image_data = [
            ImageData(
                id=image["id"],
                path=image["path"],
                folder_id=image["folder_id"],
                thumbnailPath=image["thumbnailPath"],
                metadata=image_util_parse_metadata(image["metadata"]),
                isTagged=image["isTagged"],
                isFavourite=image.get("isFavourite", False),
                tags=image["tags"],
            )
            for image in images
        ]

        return GetAllImagesResponse(
            success=True,
            message=f"Successfully retrieved {len(image_data)} images",
            data=image_data,
        )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse(
                success=False,
                error="Internal server error",
                message=f"Unable to retrieve images: {str(e)}",
            ).model_dump(),
        )


# adding add to favourite and remove from favourite routes


class ToggleFavouriteRequest(BaseModel):
    image_id: str


@router.post("/toggle-favourite")
def toggle_favourite(req: ToggleFavouriteRequest):
    image_id = req.image_id
    try:
        success = db_toggle_image_favourite_status(image_id)
        if not success:
            raise HTTPException(
                status_code=404, detail="Image not found or failed to toggle"
            )
        # Fetch updated status to return
        image = next(
            (img for img in db_get_all_images() if img["id"] == image_id), None
        )
        return {
            "success": True,
            "image_id": image_id,
            "isFavourite": image.get("isFavourite", False),
        }

    except Exception as e:
        logger.error(f"error in /toggle-favourite route: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {e}")


class ImageInfoResponse(BaseModel):
    id: str
    path: str
    folder_id: str
    thumbnailPath: str
    metadata: MetadataModel
    isTagged: bool
    isFavourite: bool
    tags: Optional[List[str]] = None


@router.get("/download/{image_id}", response_class=FileResponse)
def download_image(image_id: str):
    """
    Download an image file.
    """
    try:
        logger.info(f"Attempting to download image with ID: {image_id}")
        
        # Find image in database
        images = db_get_all_images()
        image = next((img for img in images if img["id"] == image_id), None)

        if not image:
            logger.error(f"Image ID {image_id} not found in database")
            raise HTTPException(status_code=404, detail="Image not found")

        file_path = image["path"]
        logger.info(f"Found image. Path: {file_path}")
        
        # Verify file exists
        if not os.path.exists(file_path):
             logger.error(f"File does not exist on disk at path: {file_path}")
             raise HTTPException(status_code=404, detail="File not found on disk")
             
        # Extract filename (handle both slash types just in case)
        filename = os.path.basename(file_path.replace("\\", "/"))

        return FileResponse(
            path=file_path,
            filename=filename,
            media_type="application/octet-stream"
        )

    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error downloading image {image_id}: {e}")
        raise HTTPException(
            status_code=500, 
            detail=f"Internal server error: {str(e)}"
        )
