// Debug script to test OpenAI deals search
import { searchDealsWithOpenAI } from './src/utils/dealsUtils.js';

async function debugDealsSearch() {
    console.log('🔍 Starting debug test for deals search...');
    
    // Mock location data (similar to what postal code 530337 would resolve to)
    const mockLocation = {
        type: 'postal_code',
        postalCode: '530337',
        name: 'Singapore',
        address: 'Singapore 530337',
        description: 'Singapore 530337'
    };
    
    // Mock botConfig with OpenAI API key
    const mockBotConfig = {
        openaiApiKey: process.env.OPENAI_API_KEY,
        googleCSEApiKey: process.env.GOOGLE_CSE_API_KEY,
        googleCSEId: process.env.GOOGLE_CSE_ID || '6572826d51e2f4d78'
    };
    
    console.log('📍 Location:', mockLocation);
    console.log('🔑 OpenAI API Key available:', !!mockBotConfig.openaiApiKey);
    console.log('🔑 Google CSE API Key available:', !!mockBotConfig.googleCSEApiKey);
    
    try {
        console.log('\n🚀 Calling searchDealsWithOpenAI...');
        const deals = await searchDealsWithOpenAI(mockLocation, 'food', mockBotConfig);
        
        console.log('\n✅ Search completed!');
        console.log('📊 Number of deals found:', deals ? deals.length : 0);
        
        if (deals && deals.length > 0) {
            console.log('\n🎯 First deal:');
            console.log(JSON.stringify(deals[0], null, 2));
        } else {
            console.log('\n❌ No deals returned');
        }
        
    } catch (error) {
        console.error('\n💥 Error during search:');
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
    }
}

// Run the debug test
debugDealsSearch().catch(console.error);
