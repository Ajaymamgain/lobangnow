import OpenAI from 'openai';
import { uploadToS3 } from '../utils/s3Utils.js';
import { v4 as uuidv4 } from 'uuid';

export class OpenAIImageAnalysisService {
    constructor(apiKey, s3Config = {}) {
        this.openai = new OpenAI({ apiKey });
        this.s3Config = s3Config;
    }

    /**
     * Analyze user-uploaded image and save to S3
     */
    async analyzeAndSaveImage(imageBuffer, imageType, metadata = {}) {
        try {
            console.log(`[OpenAIImageAnalysis] Analyzing image of type: ${imageType}`);
            
            // Step 1: Analyze image with OpenAI Vision
            const analysis = await this.analyzeImageWithOpenAI(imageBuffer, imageType);
            
            // Step 2: Save image to S3
            const s3Result = await this.saveImageToS3(imageBuffer, imageType, metadata);
            
            // Step 3: Return combined results
            return {
                analysis,
                s3Result,
                metadata: {
                    ...metadata,
                    analyzedAt: new Date().toISOString(),
                    imageType
                }
            };

        } catch (error) {
            console.error('[OpenAIImageAnalysis] Error analyzing and saving image:', error);
            throw error;
        }
    }

    /**
     * Analyze image using OpenAI Vision API
     */
    async analyzeImageWithOpenAI(imageBuffer, imageType) {
        try {
            // Convert buffer to base64
            const base64Image = imageBuffer.toString('base64');
            
            // Create analysis prompt based on image type
            const prompt = this.createAnalysisPrompt(imageType);
            
            const response = await this.openai.chat.completions.create({
                model: 'gpt-4-vision-preview',
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: prompt
                            },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: `data:image/jpeg;base64,${base64Image}`
                                }
                            }
                        ]
                    }
                ],
                max_tokens: 500
            });

            const analysis = response.choices[0]?.message?.content;
            console.log(`[OpenAIImageAnalysis] Image analysis completed: ${analysis?.substring(0, 100)}...`);
            
            return analysis;

        } catch (error) {
            console.error('[OpenAIImageAnalysis] Error analyzing image with OpenAI:', error);
            throw error;
        }
    }

    /**
     * Create analysis prompt based on image type
     */
    createAnalysisPrompt(imageType) {
        const basePrompt = 'Analyze this image and provide a detailed description.';
        
        const typeSpecificPrompts = {
            'restaurant_exterior': `${basePrompt} Focus on: building appearance, signage, location context, architectural style, accessibility features, and overall restaurant atmosphere.`,
            'restaurant_interior': `${basePrompt} Focus on: seating arrangement, decor style, lighting, ambiance, cleanliness, and dining environment.`,
            'food_dish': `${basePrompt} Focus on: dish presentation, ingredients visible, portion size, plating style, and visual appeal.`,
            'menu': `${basePrompt} Focus on: menu layout, pricing, available dishes, special offers, and restaurant branding.`,
            'receipt': `${basePrompt} Focus on: order details, pricing, date/time, restaurant information, and payment method.`,
            'other': `${basePrompt} Provide a general description of what you see in the image.`
        };

        return typeSpecificPrompts[imageType] || typeSpecificPrompts.other;
    }

    /**
     * Save image to S3
     */
    async saveImageToS3(imageBuffer, imageType, metadata) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `${imageType}_${timestamp}_${uuidv4()}.jpg`;
            const s3Key = `user-uploads/${imageType}/${filename}`;

            const uploadResult = await uploadToS3(
                this.s3Config.bucket,
                s3Key,
                imageBuffer,
                'image/jpeg',
                {
                    'x-amz-meta-image-type': imageType,
                    'x-amz-meta-uploaded-at': new Date().toISOString(),
                    'x-amz-meta-user-id': metadata.userId || 'unknown',
                    'x-amz-meta-restaurant-name': metadata.restaurantName || 'unknown'
                }
            );

            console.log(`[OpenAIImageAnalysis] Image saved to S3: ${s3Key}`);
            
            return {
                s3Key,
                s3Url: uploadResult.Location,
                filename,
                imageType
            };

        } catch (error) {
            console.error('[OpenAIImageAnalysis] Error saving image to S3:', error);
            throw error;
        }
    }

    /**
     * Batch analyze multiple images
     */
    async analyzeMultipleImages(images) {
        try {
            const results = [];
            
            for (const image of images) {
                try {
                    const result = await this.analyzeAndSaveImage(
                        image.buffer,
                        image.type,
                        image.metadata
                    );
                    results.push(result);
                } catch (error) {
                    console.error(`[OpenAIImageAnalysis] Error processing image: ${image.filename}`, error);
                    results.push({
                        error: error.message,
                        metadata: image.metadata
                    });
                }
            }

            return results;

        } catch (error) {
            console.error('[OpenAIImageAnalysis] Error in batch analysis:', error);
            throw error;
        }
    }

    /**
     * Get image insights summary
     */
    async getImageInsightsSummary(analyses) {
        try {
            const prompt = `Based on the following image analyses, provide a comprehensive summary of the restaurant:

${analyses.map((analysis, index) => `Image ${index + 1}: ${analysis.analysis}`).join('\n\n')}

Please provide:
1. Overall restaurant atmosphere and style
2. Key visual highlights
3. Any notable features or concerns
4. Recommendations for improvement (if any)
5. Overall rating (1-10) with justification`;

            const response = await this.openai.chat.completions.create({
                model: 'gpt-4-turbo-preview',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a restaurant analysis expert. Provide clear, actionable insights.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: 800
            });

            return response.choices[0]?.message?.content;

        } catch (error) {
            console.error('[OpenAIImageAnalysis] Error generating insights summary:', error);
            throw error;
        }
    }
}

export default OpenAIImageAnalysisService;


