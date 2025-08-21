import axios from 'axios';
import FormData from 'form-data';

class WhatsAppVideoIntegration {
  constructor(videoProcessorUrl, s3Service) {
    this.videoProcessorUrl = videoProcessorUrl;
    this.s3Service = s3Service;
  }

  /**
   * Generate viral video from deal data and image
   */
  async generateViralVideo(dealData, imageBuffer, style = 'singapore') {
    try {
      console.log('[VideoIntegration] Starting video generation for:', dealData.restaurant?.name);
      
      // Create form data for video processor
      const formData = new FormData();
      formData.append('image', imageBuffer, {
        filename: 'restaurant-deal.jpg',
        contentType: 'image/jpeg'
      });
      
      formData.append('dealData', JSON.stringify(dealData));
      formData.append('style', style);
      formData.append('duration', '5');

      // Send to video processor
      const response = await axios.post(
        `${this.videoProcessorUrl}/api/process-video`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            'Content-Type': 'multipart/form-data'
          },
          timeout: 60000 // 60 second timeout
        }
      );

      if (response.data.success) {
        console.log('[VideoIntegration] Video generated successfully:', response.data.videoUrl);
        return {
          success: true,
          videoUrl: response.data.videoUrl,
          s3Key: response.data.s3Key
        };
      } else {
        throw new Error('Video processor returned error');
      }

    } catch (error) {
      console.error('[VideoIntegration] Video generation failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create WhatsApp video message
   */
  createVideoMessage(videoUrl, dealData) {
    const restaurant = dealData.restaurant || {};
    const restaurantName = restaurant.name || 'Restaurant';
    
    return {
      type: 'video',
      video: {
        link: videoUrl,
        caption: `🎬 **VIRAL VIDEO READY!** 🎬\n\n🍽️ ${restaurantName}\n🔥 ${dealData.dealDescription || 'Special Deal'}\n💰 ${dealData.pricing || ''}\n⏰ ${dealData.validity || 'Limited Time'}\n\n📱 Share this video on TikTok, Instagram Reels, and YouTube Shorts!\n\n🚀 **Ready to go viral?**`
      }
    };
  }

  /**
   * Create interactive video approval message
   */
  createVideoApprovalMessage(videoUrl, dealData) {
    return {
      type: 'interactive',
      interactive: {
        type: 'button',
        header: {
          type: 'text',
          text: '🎬 VIRAL VIDEO READY!'
        },
        body: {
          text: `🍽️ **${dealData.restaurant?.name || 'Restaurant'}**\n🔥 ${dealData.dealDescription || 'Special Deal'}\n💰 ${dealData.pricing || ''}\n⏰ ${dealData.validity || 'Limited Time'}\n\n📱 **5-second viral video** optimized for:\n• TikTok • Instagram Reels • YouTube Shorts\n\n✨ **Ready to launch your viral campaign?**`
        },
        footer: {
          text: 'Approve and launch viral video'
        },
        action: {
          buttons: [
            {
              type: 'reply',
              reply: {
                id: 'approve_viral_video',
                title: '🚀 LAUNCH VIRAL!'
              }
            },
            {
              type: 'reply',
              reply: {
                id: 'edit_viral_video',
                title: '✏️ Edit Video'
              }
            }
          ]
        }
      }
    };
  }
}

export { WhatsAppVideoIntegration };
