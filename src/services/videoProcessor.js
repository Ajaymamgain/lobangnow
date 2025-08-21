// Mock video processor for local testing
// Actual video processing happens in the video-processor container

export async function processVideo(imageBuffer, dealData, style = 'singapore', duration = 5) {
  try {
    console.log('[VideoProcessor] Mock video processing for:', dealData.restaurant?.name);
    console.log('[VideoProcessor] Style:', style, 'Duration:', duration);
    
    // Return a mock video buffer (just the image buffer for now)
    // In production, this would be processed by the video-processor container
    return imageBuffer;
    
  } catch (error) {
    console.error('[VideoProcessor] Mock video processing error:', error);
    throw error;
  }
}
