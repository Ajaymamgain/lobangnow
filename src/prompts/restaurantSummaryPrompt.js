export const createRestaurantSummaryPrompt = (restaurantData) => {
    return `Create an engaging WhatsApp message summarizing the following restaurant information. Make it conversational and include emojis:

Restaurant Details:
- Name: ${restaurantData.name}
- Address: ${restaurantData.address}
- Phone: ${restaurantData.phone || 'Not available'}
- Website: ${restaurantData.website || 'Not available'}
- Rating: ${restaurantData.rating || 'Not available'}
- Opening Hours: ${restaurantData.openingHours ? restaurantData.openingHours.join(', ') : 'Not available'}
- Social Media: ${restaurantData.socialMedia ? restaurantData.socialMedia.join(', ') : 'Not available'}
- Description: ${restaurantData.description || 'Not available'}

Instructions:
1. Start with a friendly greeting and restaurant name
2. Include key details like location, contact info, and opening hours
3. Highlight any unique features or popular dishes mentioned in the description
4. Add social media links if available
5. End with a call to action (e.g., "Visit us today!" or "Book your table now!")
6. Use appropriate emojis throughout the message
7. Format the message in an easy-to-read way with line breaks and sections

The message should be engaging and make the reader want to visit the restaurant.`;
};

export const createRestaurantConfirmationPrompt = (restaurantData) => {
    return `Create a WhatsApp message asking the user to confirm if this is the correct restaurant:

Restaurant Details:
- Name: ${restaurantData.name}
- Address: ${restaurantData.address}
- Rating: ${restaurantData.rating || 'Not available'}

Instructions:
1. Format as a WhatsApp interactive message with two buttons: "✅ Yes, correct" and "❌ No, try again"
2. Keep the message brief but include the key details above
3. Ask if this is the restaurant they're looking for
4. Use emojis appropriately

The message should help the user quickly confirm if we found the right restaurant.`;
};

export default {
    createRestaurantSummaryPrompt,
    createRestaurantConfirmationPrompt
};


