#!/usr/bin/env node

/**
 * Test to identify and fix button functionality issues:
 * 1. Set reminders not working
 * 2. Chat AI removal verification
 * 3. Directions button showing wrong content
 */

import { handleInteractiveMessage } from '../src/handlers/lobangLahHandler.js';

// Mock session and user state for testing
function createMockSession() {
    return {
        conversation: [],
        sentMessages: [],
        userState: {
            storeId: 'cmanyfn1e0001jl04j3k45mz5',
            step: 'deals_shown',
            category: 'food',
            location: {
                type: 'gps',
                latitude: 1.3521,
                longitude: 103.8198,
                displayName: 'Marina Bay Sands',
                area: 'Marina Bay'
            },
            lastDeals: [
                {
                    dealId: 'test_deal_1',
                    businessName: 'Marina Bay Restaurant',
                    offer: '50% off all meals',
                    address: '10 Bayfront Ave, Singapore 018956',
                    latitude: '1.3521',
                    longitude: '103.8198',
                    description: 'Great seafood restaurant with amazing views'
                },
                {
                    dealId: 'test_deal_2', 
                    businessName: 'Orchard Food Court',
                    offer: 'Buy 1 Get 1 Free',
                    address: '391 Orchard Rd, Singapore 238872',
                    latitude: '1.3048',
                    longitude: '103.8318',
                    description: 'Local food court with variety of cuisines'
                }
            ]
        },
        sharedDealIds: [],
        timestamp: Date.now()
    };
}

// Mock bot config
const mockBotConfig = {
    openaiApiKey: process.env.OPENAI_API_KEY || 'test-key',
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || 'test-key'
};

async function testSetReminderFunctionality() {
    console.log('\n⏰ TESTING SET REMINDER FUNCTIONALITY');
    console.log('====================================');
    
    try {
        let session = createMockSession();
        
        console.log('📝 Testing set_reminder_0 button...');
        
        // Test set reminder for first deal
        const reminderResponse = await handleInteractiveMessage(
            'cmanyfn1e0001jl04j3k45mz5',
            '+1234567890',
            'set_reminder_0',
            mockBotConfig,
            session
        );
        
        console.log('📊 Set Reminder Response:');
        console.log('Type:', reminderResponse?.type);
        console.log('Has interactive buttons:', !!reminderResponse?.interactive?.action?.buttons);
        
        if (reminderResponse?.interactive?.action?.buttons) {
            console.log('Available reminder time options:');
            reminderResponse.interactive.action.buttons.forEach((button, index) => {
                console.log(`  ${index + 1}. ${button.reply.title} (ID: ${button.reply.id})`);
            });
        }
        
        // Test selecting a reminder time
        console.log('\n📝 Testing reminder_1hour selection...');
        session.userState.step = 'waiting_reminder_time';
        session.userState.reminderDeal = session.userState.lastDeals[0];
        
        const reminderTimeResponse = await handleInteractiveMessage(
            'cmanyfn1e0001jl04j3k45mz5',
            '+1234567890',
            'reminder_1hour',
            mockBotConfig,
            session
        );
        
        console.log('📊 Reminder Time Selection Response:');
        console.log('Type:', reminderTimeResponse?.type);
        console.log('Contains success message:', reminderTimeResponse?.text?.body?.includes('Reminder Set Successfully'));
        console.log('Contains error message:', reminderTimeResponse?.text?.body?.includes('Error Setting Reminder'));
        
        const reminderWorking = reminderResponse?.type === 'interactive' && 
                               reminderResponse?.interactive?.action?.buttons?.length > 0;
        
        console.log(`✅ Set Reminder Functionality: ${reminderWorking ? 'WORKING' : 'FAILED'}`);
        return reminderWorking;
        
    } catch (error) {
        console.error('❌ Set Reminder test failed:', error.message);
        return false;
    }
}

async function testChatAIRemoval() {
    console.log('\n🚫 TESTING CHAT AI REMOVAL');
    console.log('==========================');
    
    try {
        let session = createMockSession();
        
        console.log('📝 Testing chat_ai_deals button (should be disabled)...');
        
        const chatAIResponse = await handleInteractiveMessage(
            'cmanyfn1e0001jl04j3k45mz5',
            '+1234567890',
            'chat_ai_deals',
            mockBotConfig,
            session
        );
        
        console.log('📊 Chat AI Response:');
        console.log('Type:', chatAIResponse?.type);
        console.log('Message:', chatAIResponse?.text?.body?.substring(0, 100) + '...');
        
        const chatAIDisabled = chatAIResponse?.text?.body?.includes('disabled') || 
                              chatAIResponse?.text?.body?.includes('removed');
        
        console.log(`✅ Chat AI Removal: ${chatAIDisabled ? 'SUCCESSFULLY DISABLED' : 'STILL ACTIVE'}`);
        return chatAIDisabled;
        
    } catch (error) {
        console.error('❌ Chat AI removal test failed:', error.message);
        return false;
    }
}

async function testDirectionsFunctionality() {
    console.log('\n📍 TESTING DIRECTIONS FUNCTIONALITY');
    console.log('===================================');
    
    try {
        let session = createMockSession();
        
        console.log('📝 Testing get_directions_0 button...');
        
        const directionsResponse = await handleInteractiveMessage(
            'cmanyfn1e0001jl04j3k45mz5',
            '+1234567890',
            'get_directions_0',
            mockBotConfig,
            session
        );
        
        console.log('📊 Directions Response:');
        console.log('Type:', directionsResponse?.type);
        
        if (directionsResponse?.type === 'location') {
            console.log('✅ Returned location message with coordinates:');
            console.log('  Business Name:', directionsResponse.location?.name);
            console.log('  Address:', directionsResponse.location?.address);
            console.log('  Latitude:', directionsResponse.location?.latitude);
            console.log('  Longitude:', directionsResponse.location?.longitude);
        } else if (directionsResponse?.type === 'text') {
            console.log('📝 Returned text message:');
            console.log('  Contains business name:', directionsResponse.text?.body?.includes('Marina Bay Restaurant'));
            console.log('  Contains address:', directionsResponse.text?.body?.includes('Bayfront Ave'));
            console.log('  Contains Google Maps link:', directionsResponse.text?.body?.includes('google.com/maps'));
            console.log('  Message preview:', directionsResponse.text?.body?.substring(0, 150) + '...');
        } else {
            console.log('❌ Unexpected response type or content');
            console.log('Full response:', JSON.stringify(directionsResponse, null, 2));
        }
        
        const directionsWorking = directionsResponse?.type === 'location' || 
                                 (directionsResponse?.type === 'text' && 
                                  directionsResponse?.text?.body?.includes('google.com/maps'));
        
        console.log(`✅ Directions Functionality: ${directionsWorking ? 'WORKING' : 'FAILED'}`);
        return directionsWorking;
        
    } catch (error) {
        console.error('❌ Directions test failed:', error.message);
        return false;
    }
}

// Run all tests
async function runAllTests() {
    console.log('🔧 BUTTON FUNCTIONALITY DIAGNOSTIC TEST');
    console.log('=======================================');
    console.log('Testing the three reported issues:');
    console.log('1. Set reminders not working');
    console.log('2. Chat AI removal verification');
    console.log('3. Directions button showing wrong content');
    
    const results = {
        setReminder: await testSetReminderFunctionality(),
        chatAIRemoval: await testChatAIRemoval(),
        directions: await testDirectionsFunctionality()
    };
    
    console.log('\n📊 FINAL TEST RESULTS');
    console.log('=====================');
    console.log(`⏰ Set Reminder Functionality: ${results.setReminder ? '✅ WORKING' : '❌ FAILED'}`);
    console.log(`🚫 Chat AI Removal: ${results.chatAIRemoval ? '✅ DISABLED' : '❌ STILL ACTIVE'}`);
    console.log(`📍 Directions Functionality: ${results.directions ? '✅ WORKING' : '❌ FAILED'}`);
    
    const allFixed = Object.values(results).every(result => result);
    console.log(`\n🎯 OVERALL RESULT: ${allFixed ? '✅ ALL ISSUES FIXED' : '❌ SOME ISSUES REMAIN'}`);
    
    if (!allFixed) {
        console.log('\n⚠️ Issues that need attention:');
        if (!results.setReminder) console.log('• Set Reminder functionality needs fixing');
        if (!results.chatAIRemoval) console.log('• Chat AI needs to be properly removed');
        if (!results.directions) console.log('• Directions button needs to show correct content');
    } else {
        console.log('\n🎉 All button functionality issues have been resolved!');
    }
    
    return allFixed;
}

// Run the tests
if (import.meta.url === `file://${process.argv[1]}`) {
    runAllTests().catch(console.error);
}

export { runAllTests, testSetReminderFunctionality, testChatAIRemoval, testDirectionsFunctionality };
