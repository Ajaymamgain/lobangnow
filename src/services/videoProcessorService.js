import Replicate from 'replicate';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import OpenAI from 'openai';

/**
 * Video Processor Service for creating viral content
 * Uses Flux Kontext Pro model to generate images based on storyline
 */
export class VideoProcessorService {
    constructor(botConfig) {
        this.replicate = new Replicate({
            auth: process.env.REPLICATE_API_TOKEN,
        });
        
        this.openai = new OpenAI({
            apiKey: botConfig.openAiApiKey,
        });
        
        this.s3Client = new S3Client({
            region: process.env.AWS_REGION || 'ap-southeast-1',
        });
        
        this.bucketName = process.env.S3_BUCKET_NAME || 'viral-agency-content';
    }

    /**
     * Create a complete viral video package
     */
    async createViralVideoPackage(dealData, restaurantData, restaurantImages, botConfig) {
        try {
            console.log('[VideoProcessor] Starting viral video package creation');
            
            // Step 1: Create storyline from deal details
            const storyline = await this.createStoryline(dealData, restaurantData);
            console.log('[VideoProcessor] Storyline created:', storyline);
            
            // Step 2: Process existing restaurant images
            const processedImages = await this.processRestaurantImages(restaurantImages, storyline);
            console.log('[VideoProcessor] Restaurant images processed:', processedImages.length);
            
            // Step 3: Generate 2 new images based on storyline
            const generatedImages = await this.generateStorylineImages(storyline, dealData, restaurantData);
            console.log('[VideoProcessor] Generated images:', generatedImages.length);
            
            // Step 4: Create video composition plan
            const videoComposition = await this.createVideoComposition(storyline, processedImages, generatedImages);
            
            // Step 5: Compile final package
            const videoPackage = {
                storyline: storyline,
                restaurantImages: processedImages,
                generatedImages: generatedImages,
                videoComposition: videoComposition,
                dealData: dealData,
                restaurantData: restaurantData,
                createdAt: new Date().toISOString(),
                status: 'completed'
            };
            
            console.log('[VideoProcessor] Viral video package created successfully');
            return videoPackage;
            
        } catch (error) {
            console.error('[VideoProcessor] Error creating viral video package:', error);
            throw error;
        }
    }

    /**
     * Create engaging storyline from deal details using OpenAI
     */
    async createStoryline(dealData, restaurantData) {
        try {
            console.log('[VideoProcessor] Creating storyline from deal data');
            
            const systemPrompt = `You are a master storyteller and marketing expert specializing in creating viral food content. 
            
            Create a compelling, emotional storyline for a viral video based on this deal:
            
            DEAL: ${dealData.description}
            RESTAURANT: ${restaurantData.name}
            LOCATION: ${restaurantData.location?.address || 'Singapore'}
            PRICING: ${dealData.pricing || 'Special offer'}
            VALIDITY: ${dealData.validity || 'Limited time'}
            
            Your storyline should:
            1. Hook viewers in the first 3 seconds
            2. Create emotional connection (hunger, nostalgia, excitement)
            3. Build anticipation and urgency
            4. Include visual elements that can be represented in images
            5. End with a strong call-to-action
            6. Be suitable for 15-30 second viral video
            7. Include specific visual scenes to guide image generation
            
            Respond in JSON format:
            {
                "title": "Catchy video title",
                "hook": "Opening hook (3 seconds)",
                "emotional_arc": "Emotional journey description",
                "visual_scenes": [
                    {
                        "scene_number": 1,
                        "description": "Detailed visual description",
                        "emotion": "Emotion to convey",
                        "duration": "Duration in seconds"
                    }
                ],
                "climax": "Peak moment description",
                "call_to_action": "Strong ending call-to-action",
                "hashtags": ["relevant", "hashtags"],
                "target_audience": "Primary target audience",
                "viral_potential": "Why this will go viral"
            }`;
            
            const completion = await this.openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `Create a viral storyline for: ${dealData.description}` }
                ],
                temperature: 0.8,
                max_tokens: 1000
            });
            
            const responseText = completion.choices[0]?.message?.content || '{}';
            let storyline;
            
            try {
                storyline = JSON.parse(responseText);
            } catch (parseError) {
                console.log('[VideoProcessor] OpenAI response parsing failed, creating fallback storyline');
                storyline = this.createFallbackStoryline(dealData, restaurantData);
            }
            
            return storyline;
            
        } catch (error) {
            console.error('[VideoProcessor] Error creating storyline:', error);
            return this.createFallbackStoryline(dealData, restaurantData);
        }
    }

    /**
     * Create fallback storyline if OpenAI fails
     */
    createFallbackStoryline(dealData, restaurantData) {
        const dealTitle = dealData.title || 'Amazing Deal';
        const restaurantName = restaurantData.name || 'Our Restaurant';
        
        return {
            title: `🔥 ${dealTitle} - ${restaurantName} 🔥`,
            hook: "Hungry? This deal will make your mouth water!",
            emotional_arc: "From hunger to satisfaction",
            visual_scenes: [
                {
                    scene_number: 1,
                    description: "Close-up of delicious food being prepared",
                    emotion: "Anticipation and hunger",
                    duration: "5 seconds"
                },
                {
                    scene_number: 2,
                    description: "Chef cooking with passion and skill",
                    emotion: "Excitement and admiration",
                    duration: "5 seconds"
                },
                {
                    scene_number: 3,
                    description: "Final dish presentation with steam rising",
                    emotion: "Satisfaction and desire",
                    duration: "5 seconds"
                }
            ],
            climax: "The perfect moment when the deal is revealed",
            call_to_action: "Order now before it's gone!",
            hashtags: ["foodie", "deals", "viral", "restaurant"],
            target_audience: "Food lovers and deal hunters",
            viral_potential: "Emotional food content always performs well"
        };
    }

    /**
     * Process existing restaurant images from S3
     */
    async processRestaurantImages(restaurantImages, storyline) {
        try {
            console.log('[VideoProcessor] Processing restaurant images:', restaurantImages.length);
            
            const processedImages = [];
            
            for (let i = 0; i < restaurantImages.length; i++) {
                const image = restaurantImages[i];
                
                try {
                    // Get signed URL for S3 image
                    const signedUrl = await this.getSignedImageUrl(image.key);
                    
                    // Process image with Flux Kontext Pro to enhance it
                    const enhancedImage = await this.enhanceImageWithFlux(signedUrl, storyline, i + 1);
                    
                    processedImages.push({
                        originalKey: image.key,
                        enhancedKey: enhancedImage.key,
                        enhancedUrl: enhancedImage.url,
                        scene: storyline.visual_scenes[i] || storyline.visual_scenes[0],
                        order: i + 1
                    });
                    
                } catch (error) {
                    console.error(`[VideoProcessor] Error processing image ${i + 1}:`, error);
                    // Add original image as fallback
                    processedImages.push({
                        originalKey: image.key,
                        enhancedKey: image.key,
                        enhancedUrl: await this.getSignedImageUrl(image.key),
                        scene: storyline.visual_scenes[i] || storyline.visual_scenes[0],
                        order: i + 1,
                        error: error.message
                    });
                }
            }
            
            return processedImages;
            
        } catch (error) {
            console.error('[VideoProcessor] Error processing restaurant images:', error);
            return [];
        }
    }

    /**
     * Generate 2 new images based on storyline using Flux Kontext Pro
     */
    async generateStorylineImages(storyline, dealData, restaurantData) {
        try {
            console.log('[VideoProcessor] Generating new storyline images');
            
            const generatedImages = [];
            
            // Generate 2 new images based on storyline scenes
            for (let i = 0; i < 2; i++) {
                try {
                    const scene = storyline.visual_scenes[i] || storyline.visual_scenes[0];
                    
                    // Create prompt for image generation
                    const imagePrompt = this.createImagePrompt(scene, dealData, restaurantData);
                    
                    // Generate image using Flux Kontext Pro
                    const generatedImage = await this.generateImageWithFlux(imagePrompt, scene);
                    
                    // Save generated image to S3
                    const savedImage = await this.saveGeneratedImage(generatedImage, `generated_${i + 1}`);
                    
                    generatedImages.push({
                        prompt: imagePrompt,
                        scene: scene,
                        imageKey: savedImage.key,
                        imageUrl: savedImage.url,
                        order: i + 1,
                        type: 'generated'
                    });
                    
                } catch (error) {
                    console.error(`[VideoProcessor] Error generating image ${i + 1}:`, error);
                }
            }
            
            return generatedImages;
            
        } catch (error) {
            console.error('[VideoProcessor] Error generating storyline images:', error);
            return [];
        }
    }

    /**
     * Create image prompt for Flux Kontext Pro
     */
    createImagePrompt(scene, dealData, restaurantData) {
        const restaurantName = restaurantData.name || 'Restaurant';
        const dealDescription = dealData.description || 'Amazing deal';
        
        return `Create a viral food marketing image: ${scene.description}. 
        Restaurant: ${restaurantName}. 
        Deal: ${dealDescription}. 
        Style: Professional food photography, high quality, appetizing, 
        perfect lighting, Instagram-worthy, viral potential. 
        Emotion: ${scene.emotion}. 
        Make it irresistible and shareable!`;
    }

    /**
     * Generate image using Flux Kontext Pro model
     */
    async generateImageWithFlux(prompt, scene) {
        try {
            console.log('[VideoProcessor] Generating image with Flux Kontext Pro:', prompt.substring(0, 100) + '...');
            
            const output = await this.replicate.run(
                "black-forest-labs/flux-kontext-pro",
                {
                    input: {
                        prompt: prompt,
                        aspect_ratio: "16:9", // Video-friendly aspect ratio
                        output_format: "jpg",
                        safety_tolerance: 2,
                        prompt_upsampling: true
                    }
                }
            );
            
            console.log('[VideoProcessor] Flux Kontext Pro output:', output);
            
            // Get the image URL
            const imageUrl = output.url ? output.url() : output;
            
            return {
                url: imageUrl,
                prompt: prompt,
                scene: scene
            };
            
        } catch (error) {
            console.error('[VideoProcessor] Error generating image with Flux Kontext Pro:', error);
            throw error;
        }
    }

    /**
     * Enhance existing image with Flux Kontext Pro
     */
    async enhanceImageWithFlux(imageUrl, storyline, sceneNumber) {
        try {
            console.log('[VideoProcessor] Enhancing image with Flux Kontext Pro, scene:', sceneNumber);
            
            const scene = storyline.visual_scenes[sceneNumber - 1] || storyline.visual_scenes[0];
            const enhancementPrompt = `Enhance this restaurant image to make it more viral and engaging: ${scene.description}. 
            Make it perfect for social media sharing, with enhanced colors, perfect lighting, and irresistible appeal. 
            Emotion: ${scene.emotion}. Style: Professional food photography.`;
            
            const output = await this.replicate.run(
                "black-forest-labs/flux-kontext-pro",
                {
                    input: {
                        prompt: enhancementPrompt,
                        input_image: imageUrl,
                        aspect_ratio: "match_input_image",
                        output_format: "jpg",
                        safety_tolerance: 2,
                        prompt_upsampling: true
                    }
                }
            );
            
            const enhancedUrl = output.url ? output.url() : output;
            
            // Save enhanced image to S3
            const savedImage = await this.saveGeneratedImage({
                url: enhancedUrl,
                prompt: enhancementPrompt,
                scene: scene
            }, `enhanced_scene_${sceneNumber}`);
            
            return savedImage;
            
        } catch (error) {
            console.error('[VideoProcessor] Error enhancing image with Flux Kontext Pro:', error);
            throw error;
        }
    }

    /**
     * Save generated/enhanced image to S3
     */
    async saveGeneratedImage(imageData, filename) {
        try {
            console.log('[VideoProcessor] Saving generated image to S3:', filename);
            
            // Download image from URL
            const response = await fetch(imageData.url);
            const imageBuffer = await response.arrayBuffer();
            
            // Create unique key for S3
            const timestamp = Date.now();
            const key = `generated-images/${filename}_${timestamp}.jpg`;
            
            // Upload to S3
            await this.s3Client.send(new PutObjectCommand({
                Bucket: this.bucketName,
                Key: key,
                Body: Buffer.from(imageBuffer),
                ContentType: 'image/jpeg',
                Metadata: {
                    prompt: imageData.prompt || '',
                    scene: JSON.stringify(imageData.scene || {}),
                    generatedAt: new Date().toISOString()
                }
            }));
            
            // Get signed URL for the saved image
            const signedUrl = await this.getSignedImageUrl(key);
            
            return {
                key: key,
                url: signedUrl,
                prompt: imageData.prompt,
                scene: imageData.scene
            };
            
        } catch (error) {
            console.error('[VideoProcessor] Error saving generated image:', error);
            throw error;
        }
    }

    /**
     * Get signed URL for S3 image
     */
    async getSignedImageUrl(key) {
        try {
            const command = new GetObjectCommand({
                Bucket: this.bucketName,
                Key: key
            });
            
            const signedUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
            return signedUrl;
            
        } catch (error) {
            console.error('[VideoProcessor] Error getting signed URL:', error);
            throw error;
        }
    }

    /**
     * Create video composition plan
     */
    async createVideoComposition(storyline, processedImages, generatedImages) {
        try {
            console.log('[VideoProcessor] Creating video composition plan');
            
            const allImages = [...processedImages, ...generatedImages].sort((a, b) => a.order - b.order);
            
            const composition = {
                totalDuration: 30, // 30 seconds
                scenes: [],
                transitions: [],
                audio: {
                    background: 'Upbeat, energetic food marketing music',
                    voiceover: storyline.hook + '. ' + storyline.call_to_action
                },
                text: {
                    title: storyline.title,
                    hook: storyline.hook,
                    callToAction: storyline.call_to_action
                },
                hashtags: storyline.hashtags || ['foodie', 'deals', 'viral']
            };
            
            // Create scene breakdown
            let currentTime = 0;
            allImages.forEach((image, index) => {
                const sceneDuration = 5; // 5 seconds per scene
                
                composition.scenes.push({
                    startTime: currentTime,
                    endTime: currentTime + sceneDuration,
                    duration: sceneDuration,
                    image: image,
                    description: image.scene?.description || 'Visual scene',
                    emotion: image.scene?.emotion || 'Engagement'
                });
                
                if (index < allImages.length - 1) {
                    composition.transitions.push({
                        time: currentTime + sceneDuration,
                        type: 'fade',
                        duration: 0.5
                    });
                }
                
                currentTime += sceneDuration;
            });
            
            return composition;
            
        } catch (error) {
            console.error('[VideoProcessor] Error creating video composition:', error);
            return null;
        }
    }
}

export default VideoProcessorService;
