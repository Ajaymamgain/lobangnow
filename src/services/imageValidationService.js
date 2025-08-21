// Image Validation Service using Gemini Flash Lite
// Validates that uploaded images are actually restaurant-related

import { GoogleGenerativeAI } from '@google/generative-ai';

export default class ImageValidationService {
    constructor(geminiApiKey) {
        this.geminiApiKey = geminiApiKey;
        this.genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;
        this.model = this.genAI ? this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' }) : null;
    }

    /**
     * Validate if an image is restaurant-related using Gemini Flash Lite
     */
    async validateRestaurantImage(imageBuffer, imageType = 'image/jpeg') {
        if (!this.model) {
            console.log('[ImageValidation] Gemini API not available, skipping validation');
            return { isValid: true, reason: 'Validation skipped - API not available' };
        }

        try {
            console.log('[ImageValidation] Validating image with Gemini Flash Lite...');
            
            // Convert buffer to base64 for Gemini
            const base64Image = imageBuffer.toString('base64');
            const mimeType = imageType || 'image/jpeg';
            
            // Create the image part for Gemini
            const imagePart = {
                inlineData: {
                    data: base64Image,
                    mimeType: mimeType
                }
            };

            // Prompt for restaurant image validation
            const prompt = `Analyze this image and determine if it's related to a restaurant, food service, or dining establishment.

Look for:
- Restaurant exterior/interior
- Food/drinks
- Kitchen/cooking areas
- Dining tables/chairs
- Restaurant signage/menu
- Staff/chef in action
- Food preparation areas

Respond with ONLY a JSON object:
{
  "isRestaurantRelated": true/false,
  "confidence": 0.0-1.0,
  "whatISee": "brief description of what's in the image",
  "reason": "why this is/isn't restaurant-related"
}

If the image shows personal photos, random objects, or anything unrelated to restaurants/food, mark it as false.`;

            const result = await this.model.generateContent([prompt, imagePart]);
            const response = await result.response;
            const text = response.text();
            
            console.log('[ImageValidation] Gemini response:', text);
            
            // Parse the JSON response
            let validationResult;
            try {
                // Extract JSON from response (handle markdown formatting)
                const jsonMatch = text.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    validationResult = JSON.parse(jsonMatch[0]);
                } else {
                    throw new Error('No JSON found in response');
                }
            } catch (parseError) {
                console.error('[ImageValidation] Failed to parse Gemini response:', parseError);
                // Fallback validation
                return { isValid: true, reason: 'Validation failed - defaulting to accept' };
            }

            const isValid = validationResult.isRestaurantRelated && validationResult.confidence > 0.6;
            
            return {
                isValid,
                confidence: validationResult.confidence,
                whatISee: validationResult.whatISee,
                reason: validationResult.reason,
                rawResponse: validationResult
            };

        } catch (error) {
            console.error('[ImageValidation] Error validating image with Gemini:', error);
            // Fallback: accept the image if validation fails
            return { isValid: true, reason: 'Validation error - defaulting to accept' };
        }
    }

    /**
     * Check if image count exceeds limit and provide appropriate response
     */
    checkImageLimit(currentCount, maxCount = 4) {
        if (currentCount >= maxCount) {
            return {
                canAccept: false,
                message: `📸 **Maximum Images Reached**\n\nYou've already uploaded ${currentCount} restaurant photos, which is the maximum allowed.\n\n✅ **What you can do:**\n• Type "done" to continue with deal creation\n• Replace an existing photo by typing "replace [photo number]"\n• Start over by typing "restart"\n\n💡 **Current photos:** ${currentCount}/4`
            };
        }
        
        const remaining = maxCount - currentCount;
        return {
            canAccept: true,
            remaining,
            message: `📸 **Image Uploaded Successfully!**\n\nYou've collected ${currentCount + 1}/${maxCount} restaurant photos.\n\n${remaining > 1 ? `You can send ${remaining - 1} more photo(s) or type "done" when finished.` : 'You can send 1 more photo or type "done" when finished.'}`
        };
    }

    /**
     * Validate multiple images and provide summary
     */
    async validateMultipleImages(imageBuffers, imageTypes = []) {
        const results = [];
        
        for (let i = 0; i < imageBuffers.length; i++) {
            const validation = await this.validateRestaurantImage(imageBuffers[i], imageTypes[i]);
            results.push({
                index: i,
                ...validation
            });
        }
        
        const validImages = results.filter(r => r.isValid);
        const invalidImages = results.filter(r => !r.isValid);
        
        return {
            total: results.length,
            valid: validImages.length,
            invalid: invalidImages.length,
            results,
            summary: {
                validImages: validImages.map(r => ({ index: r.index, whatISee: r.whatISee })),
                invalidImages: invalidImages.map(r => ({ index: r.index, reason: r.reason }))
            }
        };
    }
}
