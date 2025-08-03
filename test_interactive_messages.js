// Test Interactive Messages with Google Places Data
import { enhanceDealsWithPhotos, createEnhancedDealMessages } from './src/utils/enhancedDealUtils.js';

// Mock deals data (similar to what OpenAI would return)
const mockDeals = [
    {
        businessName: "Yi Ji Fried Hokkien Prawn Mee",
        address: "805 Hougang Central, Singapore 530805",
        offer: "Wet-style Hokkien mee starting from $6, topped with crispy puffs of lard and sweet shrimp pieces.",
        contact: "Tel: 9140 9009",
        validity: "Daily, 11am to 8pm",
        title: "Authentic Hokkien Mee Deal",
        description: "Traditional wet-style Hokkien mee with fresh prawns and crispy lard",
        coordinates: { latitude: 1.3721, longitude: 103.8886 }
    },
    {
        businessName: "Anshun Fish Soup",
        address: "123 Hougang Ave 1, Singapore 530123",
        offer: "Fresh fish soup with rice from $5.50",
        contact: "Tel: 8888 9999",
        validity: "Monday to Saturday, 10am to 9pm",
        title: "Fresh Fish Soup Special",
        description: "Daily fresh fish soup with vegetables and rice"
    }
];

// Mock nearby places with Google Places data (similar to what Google Places API would return)
const mockNearbyPlaces = [
    {
        name: "Hougang Oyster Omelette & Fried Kway Teow",
        place_id: "ChIJnclE0zgW2jERphSxyR46atE",
        rating: 4.3,
        vicinity: "435A Hougang Ave 8, Singapore 531435",
        photos: [
            {
                photo_reference: "places/ChIJnclE0zgW2jERphSxyR46atE/photos/ATKogpfVs7GZkFdnf8bsAJvGelT9v9AL5IZ_RghC_6G3c7WRYF8-K8NXVAUzRTfkSIUuEHzYEZ9QT1SrtIL6eeusWPOCZM5cHiPJ1e0J1EBbVYwc9TB4ClVN3el9Ci8psI8w8Gfjy1rDsCvnap45_0R0amV1to0Htkl-cYEdZ1NRE555a5ojrl2KSauvVDAMJNJpnV5bgz-YX5mw1DSUcNhWBGuJDmpiXxJ9r-YmYEc20zfE969333kDngRx8KHKmA_7XFy9z_zc1MyVkNx4F5QmhLHyINzoowlDldLUZ8zB-v3zZxYI7daj5fPB6wQsFU7Y3m_XTiOJICLpVeEbueAs2tyjnhyuxGyDAVwG_jDLwXb9FPib1JpdipN8WVEIERyJRjngNlypimUU4-hfRNCXdni4acpxxy367-56d5Y-0pvYZN70",
                width: 4032,
                height: 3024
            }
        ],
        types: ["restaurant", "food", "establishment"]
    },
    {
        name: "Texas Chicken (Hougang Capeview)",
        place_id: "ChIJ123456789",
        rating: 4.1,
        vicinity: "681 Hougang Ave 8, Singapore 530681",
        photos: [
            {
                photo_reference: "mock_photo_reference_texas_chicken",
                width: 3000,
                height: 2000
            }
        ],
        types: ["restaurant", "food", "establishment"]
    }
];

const mockGoogleMapsApiKey = "AIzaSyAEickHlx5T4alk1Cu5ks-EzF8xzyxoTDQ";

async function testInteractiveMessages() {
    console.log("🧪 Testing Interactive Messages with Google Places Data\n");
    
    try {
        // Step 1: Enhance deals with photos
        console.log("📸 Step 1: Enhancing deals with Google Places photos...");
        const enhancedDeals = enhanceDealsWithPhotos(mockDeals, mockNearbyPlaces, mockGoogleMapsApiKey);
        
        console.log(`✅ Enhanced ${enhancedDeals.length} deals`);
        enhancedDeals.forEach((deal, index) => {
            console.log(`   Deal ${index + 1}: ${deal.businessName}`);
            console.log(`   - Has photo: ${!!deal.photoUrl}`);
            console.log(`   - Place name: ${deal.placeName || 'N/A'}`);
            console.log(`   - Rating: ${deal.placeRating || 'N/A'}`);
            console.log(`   - Vicinity: ${deal.placeVicinity || 'N/A'}`);
        });
        
        // Step 2: Create interactive messages
        console.log("\n🎯 Step 2: Creating interactive messages...");
        const interactiveMessages = createEnhancedDealMessages(enhancedDeals, 'food');
        
        console.log(`✅ Created ${interactiveMessages.length} interactive messages`);
        
        // Step 3: Analyze message structure
        console.log("\n📋 Step 3: Analyzing message structure...");
        interactiveMessages.forEach((message, index) => {
            console.log(`\n--- Message ${index + 1} ---`);
            console.log(`Type: ${message.type}`);
            
            if (message.type === 'interactive') {
                console.log(`✅ INTERACTIVE MESSAGE (as requested)`);
                console.log(`Interactive type: ${message.interactive.type}`);
                console.log(`Has header: ${!!message.interactive.header}`);
                if (message.interactive.header) {
                    console.log(`Header type: ${message.interactive.header.type}`);
                    if (message.interactive.header.type === 'image') {
                        console.log(`✅ HAS GOOGLE PLACES PHOTO`);
                        console.log(`Photo URL: ${message.interactive.header.image.link.substring(0, 100)}...`);
                    }
                }
                console.log(`Has body: ${!!message.interactive.body}`);
                console.log(`Has footer: ${!!message.interactive.footer}`);
                console.log(`Has buttons: ${!!message.interactive.action?.buttons}`);
                if (message.interactive.action?.buttons) {
                    console.log(`Number of buttons: ${message.interactive.action.buttons.length}`);
                    message.interactive.action.buttons.forEach((button, btnIndex) => {
                        console.log(`   Button ${btnIndex + 1}: ${button.title} (ID: ${button.id})`);
                    });
                }
                
                // Check if deal data is included
                if (message.dealData) {
                    console.log(`✅ HAS DEAL DATA`);
                    console.log(`   Business: ${message.dealData.businessName}`);
                    console.log(`   Address: ${message.dealData.address}`);
                    console.log(`   Rating: ${message.dealData.placeRating}`);
                    console.log(`   Contact: ${message.dealData.contact}`);
                }
            } else {
                console.log(`❌ NOT INTERACTIVE (Type: ${message.type})`);
            }
        });
        
        // Step 4: Verify key requirements
        console.log("\n✅ Step 4: Verification Summary");
        const allInteractive = interactiveMessages.every(msg => msg.type === 'interactive');
        const hasPhotos = interactiveMessages.some(msg => msg.interactive?.header?.type === 'image');
        const hasButtons = interactiveMessages.every(msg => msg.interactive?.action?.buttons?.length > 0);
        const hasGoogleData = interactiveMessages.some(msg => msg.dealData?.placeRating);
        
        console.log(`✅ All messages are interactive: ${allInteractive ? 'YES' : 'NO'}`);
        console.log(`✅ Has Google Places photos: ${hasPhotos ? 'YES' : 'NO'}`);
        console.log(`✅ All messages have action buttons: ${hasButtons ? 'YES' : 'NO'}`);
        console.log(`✅ Includes Google Places data (ratings): ${hasGoogleData ? 'YES' : 'NO'}`);
        
        if (allInteractive && hasPhotos && hasButtons && hasGoogleData) {
            console.log("\n🎉 SUCCESS: All requirements met!");
            console.log("✅ Interactive messages with Google Places photos, ratings, and action buttons");
            console.log("✅ No more simple image messages with captions");
            console.log("✅ Users can now tap buttons for directions, sharing, and calling");
        } else {
            console.log("\n❌ ISSUES FOUND:");
            if (!allInteractive) console.log("   - Some messages are not interactive");
            if (!hasPhotos) console.log("   - Missing Google Places photos");
            if (!hasButtons) console.log("   - Missing action buttons");
            if (!hasGoogleData) console.log("   - Missing Google Places data");
        }
        
    } catch (error) {
        console.error("❌ Test failed:", error);
    }
}

// Run the test
testInteractiveMessages();
