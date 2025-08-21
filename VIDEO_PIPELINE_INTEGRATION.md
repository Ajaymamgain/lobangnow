# Video Pipeline Integration

## Overview

The video pipeline has been integrated into the WhatsApp store bot to automatically generate viral videos when restaurant owners submit deals.

## How It Works

### 1. Deal Submission Flow
```
Restaurant Owner → Submit Deal → OpenAI Message → Flux Image → Video Generation → Interactive Response
```

### 2. Video Generation Process
- **OpenAI**: Generates compelling deal message
- **Flux Schnell**: Creates high-quality poster image
- **FFmpeg**: Generates 5-second viral video with text overlays
- **S3**: Uploads both image and video
- **WhatsApp**: Sends interactive message with video viewing option

### 3. Interactive Message Features
- **Header**: Generated poster image
- **Body**: Deal details + video availability
- **Buttons**: 
  - 🎬 **Watch Video** - Sends the viral video
  - 🚀 **LAUNCH!** - Approves and publishes content
  - ✏️ **Edit Content** - Allows modifications

## Integration Points

### Files Modified
- `src/handlers/dailyDealHandler.js` - Main integration
- `src/services/dealPipeline.js` - Video processing service
- `src/services/videoProcessor.js` - FFmpeg video generation
- `src/services/s3Service.js` - S3 upload service

### New Dependencies
```json
{
  "replicate": "^0.22.0",
  "fluent-ffmpeg": "^2.1.2",
  "canvas": "^2.11.2",
  "form-data": "^4.0.0"
}
```

## Configuration

### Environment Variables
```bash
OPENAI_API_KEY=your-openai-key
REPLICATE_API_TOKEN=your-replicate-token
VIDEO_PROCESSOR_URL=http://your-ec2-ip:3000
```

### Bot Config (DynamoDB)
```json
{
  "videoProcessorUrl": "http://your-ec2-ip:3000",
  "enableViralPipeline": true
}
```

## Usage

### For Restaurant Owners
1. **Submit deal** via text message
2. **Receive** interactive message with image header
3. **Click "🎬 Watch Video"** to view viral video
4. **Click "🚀 LAUNCH!"** to approve and publish

### For Developers
1. **Deploy video processor** on EC2
2. **Set environment variables** in bot config
3. **Test integration** with sample deals
4. **Monitor** video generation success rate

## Testing

### Run Integration Test
```bash
node test-video-pipeline.js
```

### Test Video Pipeline
```bash
curl -X POST http://your-ec2-ip:3000/api/deal-pipeline \
  -H "Content-Type: application/json" \
  -d '{
    "dealData": {
      "restaurant": {"name": "Test Restaurant", "address": "Singapore"},
      "dealDescription": "Test Deal",
      "pricing": "$5.90",
      "validity": "Today Only"
    },
    "ownerNumber": "919711123199"
  }'
```

## Error Handling

### Fallbacks
1. **Flux fails** → OpenAI Images fallback
2. **Video generation fails** → Image-only response
3. **S3 upload fails** → Local storage fallback
4. **OpenAI fails** → Template message fallback

### Monitoring
- Check CloudWatch logs for errors
- Monitor S3 upload success rate
- Track video generation performance

## Performance

### Expected Results
- **Processing time**: 10-30 seconds per video
- **Video quality**: 1080x1920, 30fps, H.264
- **File size**: 2-5 MB per 5-second video
- **Success rate**: 95%+ with fallbacks

### Optimization
- **Concurrent processing**: Up to 5 videos simultaneously
- **Caching**: Reuse generated content
- **CDN**: CloudFront for faster delivery

## Troubleshooting

### Common Issues
1. **Video not generated**: Check EC2 video processor logs
2. **S3 upload failed**: Verify IAM permissions
3. **FFmpeg errors**: Ensure dependencies installed
4. **API timeouts**: Increase Lambda timeout

### Debug Commands
```bash
# Check video processor health
curl http://your-ec2-ip:3000/api/health

# View EC2 logs
tail -f /var/log/syslog

# Check S3 bucket
aws s3 ls s3://your-bucket/videos/
```

## Future Enhancements

### Planned Features
- **Batch processing** for multiple deals
- **Video templates** for different styles
- **Auto-posting** to social platforms
- **Performance analytics** dashboard
- **A/B testing** for viral content

### Scalability
- **Auto-scaling** EC2 instances
- **Load balancing** for high traffic
- **Queue system** for batch processing
- **Edge computing** for faster delivery

