import { useState, useCallback, useMemo, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
// import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { MediaViewProps } from '@/types/Media';
import { selectCurrentViewIndex } from '@/features/imageSelectors';
import { setCurrentViewIndex, closeImageView } from '@/features/imageSlice';

// Modular components
import { MediaViewControls } from './MediaViewControls';
import { ZoomControls } from './ZoomControls';
import { MediaThumbnails } from './MediaThumbnails';
import { MediaInfoPanel } from './MediaInfoPanel';
import { ImageViewer } from './ImageViewer';
import { NavigationButtons } from './NavigationButtons';
import type { ImageViewerRef } from './ImageViewer';

// Custom hooks
import { useImageViewControls } from '@/hooks/useImageViewControls';
import { useSlideshow } from '@/hooks/useSlideshow';
import { useKeyboardNavigation } from '@/hooks/useKeyboardNavigation';
import { useToggleFav } from '../../hooks/useToggleFav';
import { useLocation } from 'react-router';
import { ROUTES } from '@/constants/routes';
import { apiClient } from '@/api/axiosConfig';

export function MediaView({
  onClose,
  type = 'image',
  images = [],
}: MediaViewProps) {
  const dispatch = useDispatch();

  // Redux selectors
  const currentViewIndex = useSelector(selectCurrentViewIndex);
  const totalImages = images.length;
  // guard: images default to empty array in the signature so `images.length` is safe

  const currentImage = useMemo(() => {
    if (currentViewIndex >= 0 && currentViewIndex < images.length) {
      return images[currentViewIndex];
    }
    return null;
  }, [images, currentViewIndex]);

  const imageViewerRef = useRef<ImageViewerRef>(null);

  // Local UI state
  const [showInfo, setShowInfo] = useState(false);
  const [showThumbnails, setShowThumbnails] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Custom hooks
  const { viewState, handlers } = useImageViewControls();
  // Navigation handlers
  const handleNextImage = useCallback(() => {
    if (currentViewIndex < images.length - 1) {
      dispatch(setCurrentViewIndex(currentViewIndex + 1));
      handlers.resetZoom();
    }
  }, [dispatch, handlers, currentViewIndex, images.length]);

  const handlePreviousImage = useCallback(() => {
    if (currentViewIndex > 0) {
      dispatch(setCurrentViewIndex(currentViewIndex - 1));
      handlers.resetZoom();
    }
  }, [dispatch, handlers, currentViewIndex]);

  const handleClose = useCallback(() => {
    dispatch(closeImageView());
    onClose && onClose();
  }, [dispatch, onClose]);

  const handleThumbnailClick = useCallback(
    (index: number) => {
      dispatch(setCurrentViewIndex(index));
      handlers.resetZoom();
    },
    [dispatch, handlers],
  );

  const location = useLocation();
  const { toggleFavourite } = useToggleFav();

  // Slideshow functionality
  const { isSlideshowActive, toggleSlideshow } = useSlideshow(
    totalImages,
    handleNextImage,
  );

  // Folder Open functionality
  const handleOpenFolder = async () => {
    if (!currentImage?.path) return;
    try {
      // await revealItemInDir(currentImage.path);
    } catch (err) {
      console.log(err);
      console.error('Failed to open folder.');
    }
  };

  // Toggle functions
  const toggleInfo = useCallback(() => {
    setShowInfo((prev) => !prev);
  }, []);

  // Hooks that depend on currentImage but always declared
  const handleToggleFavourite = useCallback(() => {
    if (currentImage) {
      if (currentImage?.id) {
        toggleFavourite(currentImage.id);
      }
      if (location.pathname === ROUTES.FAVOURITES) handleClose();
    }
  }, [currentImage, toggleFavourite]);

  const handleZoomIn = useCallback(() => {
    imageViewerRef.current?.zoomIn();
  }, []);

  const handleZoomOut = useCallback(() => {
    imageViewerRef.current?.zoomOut();
  }, []);

  const handleResetZoom = useCallback(() => {
    imageViewerRef.current?.reset();
    handlers.resetZoom();
    setResetSignal((s) => s + 1);
  }, [handlers]);

  // Keyboard navigation
  useKeyboardNavigation({
    onClose: handleClose,
    onNext: handleNextImage,
    onPrevious: handlePreviousImage,
    onZoomIn: handleZoomIn,
    onZoomOut: handleZoomOut,
    onRotate: handlers.handleRotate,
    onToggleInfo: toggleInfo,
  });

  // Download functionality
  const handleDownload = useCallback(async () => {
    if (currentImage && currentImage.id) {
      try {
        const response = await apiClient.get(
          `/images/download/${currentImage.id}`,
          {
            responseType: 'blob',
          },
        );

        // Create blob link to download
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;

        // Extract filename or use default
        let filename = `image-${currentImage.id}.jpg`;
        const contentDisposition = response.headers['content-disposition'];
        if (contentDisposition) {
          const filenameMatch =
            contentDisposition.match(/filename="?([^"]+)"?/);
          if (filenameMatch && filenameMatch.length === 2) {
            filename = filenameMatch[1];
          }
        }

        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();

        // Cleanup
        link.parentNode?.removeChild(link);
        window.URL.revokeObjectURL(url);

        // Show success toast
        setToastMessage('Image Downloaded Successfully!');
        setTimeout(() => setToastMessage(null), 3000);
      } catch (error) {
        console.error('Download failed', error);
        setToastMessage('Download Failed');
        setTimeout(() => setToastMessage(null), 3000);
      }
    }
  }, [currentImage]);

  // Early return if no images or invalid index
  if (!images?.length || currentViewIndex === -1 || !currentImage) {
    return null;
  }

  // Safe variables
  const currentImagePath = currentImage.path;
  // console.log(currentImage);
  const currentImageAlt = `image-${currentViewIndex}`;

  return (
    <div className="fixed inset-0 z-50 mt-0 flex flex-col bg-gradient-to-b from-black/95 to-black/98 backdrop-blur-lg">
      {/* Controls */}
      <MediaViewControls
        showInfo={showInfo}
        onToggleInfo={toggleInfo}
        onToggleFavourite={handleToggleFavourite}
        isFavourite={currentImage.isFavourite || false}
        onOpenFolder={handleOpenFolder}
        isSlideshowActive={isSlideshowActive}
        onToggleSlideshow={toggleSlideshow}
        onClose={handleClose}
        onDownload={handleDownload}
        type={type}
      />

      {/* Main viewer area */}
      <div
        className="relative flex h-full w-full items-center justify-center overflow-visible"
        onClick={(e) => {
          if (e.target === e.currentTarget) handleClose();
        }}
      >
        {type === 'image' && (
          <ImageViewer
            ref={imageViewerRef}
            imagePath={currentImagePath}
            alt={currentImageAlt}
            rotation={viewState.rotation}
            resetSignal={resetSignal}
          />
        )}

        {/* Navigation buttons */}
        <NavigationButtons
          onPrevious={handlePreviousImage}
          onNext={handleNextImage}
        />
      </div>

      {/* Zoom controls */}
      {type === 'image' && (
        <ZoomControls
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onRotate={handlers.handleRotate}
          onReset={handleResetZoom}
          showThumbnails={showThumbnails}
        />
      )}

      {/* Thumbnails */}
      <div
        onMouseEnter={() => setShowThumbnails(true)}
        onMouseLeave={() => setShowThumbnails(false)}
      >
        <MediaThumbnails
          images={images}
          currentIndex={currentViewIndex}
          showThumbnails={showThumbnails}
          onThumbnailClick={handleThumbnailClick}
          type={type}
        />
      </div>

      {/* Info panel */}
      <MediaInfoPanel
        show={showInfo}
        onClose={toggleInfo}
        currentImage={currentImage}
        currentIndex={currentViewIndex}
        totalImages={totalImages}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="animate-in fade-in slide-in-from-bottom-4 fixed bottom-8 left-1/2 z-[100] -translate-x-1/2 transform rounded-full border border-white/20 bg-white/10 px-6 py-3 text-sm font-medium text-white shadow-lg backdrop-blur-md duration-300">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
