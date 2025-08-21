# SDXL Migration Guide - Replacing Flux Schnell with SDXL

## 🎯 **Overview**

This document outlines the migration from **Flux Schnell** to **SDXL (Stable Diffusion XL)** for food image generation in the store-ai-bot. This migration provides superior food photography quality and better integration with the video-processor pipeline.

## 🚀 **Why SDXL Instead of Flux?**

### **Flux Schnell Limitations:**
- **Fast but lower quality** - Optimized for speed over quality
- **Limited food photography** - Not specifically trained for food images
- **Basic text handling** - Limited text overlay capabilities
- **Inconsistent results** - Variable quality across different prompts

### **SDXL Advantages:**
- **Superior image quality** - Professional-grade food photography
- **Better food rendering** - Optimized for appetizing food presentation
- **Consistent results** - More reliable and predictable output
- **Professional aesthetics** - Suitable for marketing and viral content
- **Better integration** - Works seamlessly with video-processor text overlays

## 🔄 **Migration Changes**

### **1. Service Layer Changes**

#### **Before (Flux Schnell):**
```javascript
// Old Flux implementation
const output = await this.replicate.run(
  "black-forest-labs/flux-schnell",
  {
    input: {
      prompt: optimizedPrompt,
      go_fast: true,
      megapixels: "1",
      num_outputs: 1,
      aspect_ratio: "9:16",
      output_format: "webp",
      output_quality: 80,
      num_inference_steps: 4
    }
  }
);
```

#### **After (SDXL):**
```javascript
// New SDXL implementation
const output = await this.replicate.run(
  "stability-ai/sdxl:610dddf033f10431b1b55f24510b6009fcba23017ee551a1b9afbc4eec79e29c",
  {
    input: {
      width: 1024,
      height: 1024,
      prompt: prompt,
      refine: "base_image_refiner",
      scheduler: "KarrasDPM",
      num_outputs: 1,
      guidance_scale: 7.5,
      high_noise_frac: 0.8,
      prompt_strength: 0.8,
      num_inference_steps: 25,
      negative_prompt: "text, watermark, logo, blurry, low quality, distorted, ugly, scary, inappropriate, white background, solid background, background, people, faces, hands, fingers"
    }
  }
);
```

### **2. New SDXL Service**

#### **Key Features:**
- **Professional food photography** - Optimized prompts for restaurant deals
- **Multiple image generation** - Creates 4 varied images for video processing
- **Quality optimization** - Higher resolution and better inference steps
- **Negative prompts** - Prevents unwanted elements like text or watermarks

#### **Service Methods:**
```javascript
class SDXLService {
  // Generate 4 food images for video processing
  async generateFoodImages(dealData, restaurantData, numImages = 4, options = {})
  
  // Generate single high-quality image
  async generateSingleFoodImage(prompt, dealData, restaurantData, imageIndex, options = {})
  
  // Generate deal poster (9:16 aspect ratio)
  async generateDealPoster(dealData, restaurantData, options = {})
  
  // Test connection and functionality
  async testConnection()
}
```

### **3. Updated Pipeline Flow**

#### **Before (Flux + Canvas):**
1. Generate image with Flux Schnell
2. Add text overlays using Canvas API
3. Upload final poster to S3
4. Send to customer

#### **After (SDXL + Video-Processor):**
1. **Generate 4 SDXL food images** (no text overlays)
2. **Upload images to S3** (clean base images)
3. **Send S3 URLs to video-processor**
4. **Video-processor adds text overlays** using FFmpeg
5. **Generate 12-second video** with phonk-tiktok music
6. **Upload final video to S3**
7. **Send interactive WhatsApp message** to store owner

## 📁 **File Changes**

### **New Files Created:**
- `src/services/sdxlService.js` - New SDXL service
- `test-sdxl-integration.js` - SDXL integration test
- `SDXL_MIGRATION.md` - This documentation

### **Files Modified:**
- `src/services/dealPipeline.js` - Updated to use SDXL
- `src/utils/viralContentUtils.js` - Replaced Flux with SDXL
- `src/utils/dealPosterUtils.js` - Updated for SDXL integration

### **Files Removed/Deprecated:**
- Flux Schnell specific code
- Canvas-based text overlay logic
- Direct poster generation functions

## 🎨 **Image Generation Strategy**

### **4-Image Approach:**
Instead of generating one poster image, SDXL now generates **4 specialized images**:

1. **Main Dish Focus** - Close-up of the deal item
2. **Restaurant Ambiance** - Interior atmosphere and decor
3. **Food Ingredients** - Fresh ingredients and preparation
4. **Restaurant Exterior** - Location and storefront

### **Prompt Engineering:**
```javascript
// Professional food photography prompts
const baseStyle = "professional food photography, high resolution, appetizing, vibrant colors, natural lighting, restaurant quality, no text, no watermark, clean background, food styling, Singapore cuisine";

// Image 1: Main dish focus
`Delicious ${dealData.title.toLowerCase()}, professional food photography, ${baseStyle}, close-up shot, appetizing presentation, restaurant plating, high-end food styling, natural lighting, no text overlay, clean composition`

// Image 2: Restaurant ambiance
`Beautiful ${restaurantData.name} restaurant interior, cozy dining atmosphere, warm lighting, elegant decor, professional restaurant photography, no text overlay, clean background, inviting atmosphere, Singapore restaurant`
```

## 🔧 **Configuration**

### **Environment Variables:**
```bash
REPLICATE_API_TOKEN=r8_BYNZbnbXneg5HJUQWqSr4AyoFi10C0D4KuaiC
VIDEO_PROCESSOR_URL=http://5.223.75.242:3000
```

### **SDXL Parameters:**
```javascript
const sdxlOptions = {
  width: 1024,                    // Image width
  height: 1024,                   // Image height (or 1792 for 9:16)
  guidance_scale: 7.5,            // Creativity vs. prompt adherence
  high_noise_frac: 0.8,          // Noise reduction
  prompt_strength: 0.8,          // Prompt influence
  num_inference_steps: 25,       // Quality vs. speed
  negative_prompt: "text, watermark, logo, blurry, low quality, distorted, ugly, scary, inappropriate, white background, solid background, background, people, faces, hands, fingers"
};
```

## 🧪 **Testing**

### **Run SDXL Integration Test:**
```bash
cd store-ai-bot
node test-sdxl-integration.js
```

### **Test Individual Components:**
```javascript
// Test SDXL service
const sdxlService = new SDXLService(process.env.REPLICATE_API_TOKEN);
const testResult = await sdxlService.testConnection();

// Test deal pipeline
const dealPipeline = new DealPipeline(config);
const pipelineTest = await dealPipeline.testPipeline();
```

## 📊 **Performance Comparison**

| **Metric** | **Flux Schnell** | **SDXL** |
|------------|------------------|----------|
| **Speed** | ⚡ Fast (4 steps) | 🐌 Slower (25 steps) |
| **Quality** | 🟡 Medium | 🟢 High |
| **Food Photography** | 🟡 Good | 🟢 Excellent |
| **Consistency** | 🟡 Variable | 🟢 Consistent |
| **Text Handling** | 🔴 Limited | 🟢 Professional |
| **Integration** | 🟡 Basic | 🟢 Advanced |

## 🚀 **Benefits of Migration**

### **For Store Owners:**
- **Higher quality images** - Professional food photography
- **Better viral potential** - More appealing visual content
- **Consistent branding** - Uniform image quality across deals

### **For Customers:**
- **Appetizing visuals** - Better food presentation
- **Professional look** - Trustworthy restaurant branding
- **Engaging content** - Higher quality social media material

### **For Developers:**
- **Cleaner architecture** - Separation of concerns
- **Better maintainability** - Modern AI model integration
- **Scalable pipeline** - Easy to extend and modify

## 🔮 **Future Enhancements**

### **Planned Improvements:**
- **Batch processing** - Generate multiple deals simultaneously
- **Style variations** - Different visual styles for different restaurant types
- **A/B testing** - Test different prompts for optimal results
- **Performance optimization** - Parallel image generation
- **Quality metrics** - Automated quality assessment

### **Integration Opportunities:**
- **Real-time generation** - On-demand image creation
- **Style transfer** - Apply restaurant-specific visual themes
- **Seasonal variations** - Holiday and event-specific styling
- **Localization** - Region-specific visual elements

## 📝 **Migration Checklist**

- [x] **Create SDXL service** - New service for image generation
- [x] **Update deal pipeline** - Replace Flux with SDXL
- [x] **Update utility functions** - Migrate viral content utils
- [x] **Update poster utils** - Remove Canvas dependencies
- [x] **Create test scripts** - Verify SDXL integration
- [x] **Update documentation** - Document migration changes
- [ ] **Deploy to production** - Test in live environment
- [ ] **Monitor performance** - Track image quality and generation time
- [ ] **Gather feedback** - Collect user experience data
- [ ] **Optimize prompts** - Fine-tune for best results

## 🆘 **Troubleshooting**

### **Common Issues:**

#### **SDXL Connection Failed:**
```bash
# Check API token
echo $REPLICATE_API_TOKEN

# Test connection
node -e "import('./src/services/sdxlService.js').then(m => new m.default('your_token').testConnection())"
```

#### **Image Generation Failed:**
```javascript
// Check prompt length and content
// Ensure no special characters in prompts
// Verify API rate limits
```

#### **S3 Upload Issues:**
```bash
# Check AWS credentials
aws sts get-caller-identity

# Verify S3 bucket access
aws s3 ls s3://your-bucket-name
```

## 📚 **Additional Resources**

- **SDXL Documentation**: [Replicate SDXL Model](https://replicate.com/stability-ai/sdxl)
- **Food Photography Tips**: [Professional Food Photography Guide](https://example.com)
- **Prompt Engineering**: [AI Image Prompt Best Practices](https://example.com)
- **Video Processing**: [FFmpeg Text Overlay Tutorial](https://example.com)

---

**Migration completed on**: August 16, 2025  
**Next review**: September 16, 2025  
**Maintained by**: AI Development Team



