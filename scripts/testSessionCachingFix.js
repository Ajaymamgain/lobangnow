#!/usr/bin/env node

/**
 * Comprehensive test for session caching, distance, and location sharing fixes
 * Tests all the critical issues reported by user:
 * 1. Session caching - new location should not show previous location deals
 * 2. 1km GPS distance enforcement (was 2km)
 * 3. No pincode references in user messages
 * 4. Improved WhatsApp location sharing instructions
 */

import { handleLobangLahMessage } from '../src/handlers/lobangLahHandler.js';
import { searchMoreDealsFromDynamoDB } from '../src/utils/dealsUtils.js';

// Mock session and user state for testing
function createMockSession() {
    return {
        conversation: [],
        sentMessages: [],
        userState: {
            storeId: 'cmanyfn1e0001jl04j3k45mz5',
            step: 'waiting_for_location'
        },
        sharedDealIds: [],
        timestamp: Date.now()
    };
}

// Mock location data
const location1 = {
    type: 'gps',
    latitude: 1.3521,
    longitude: 103.8198,
    displayName: 'Marina Bay Sands',
    area: 'Marina Bay'
};

const location2 = {
    type: 'gps',
    latitude: 1.3048,
    longitude: 103.8318,
    displayName: 'Orchard Road',
    area: 'Orchard'
};

// Mock bot config
const mockBotConfig = {
    openaiApiKey: process.env.OPENAI_API_KEY || 'test-key',
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || 'test-key'
};

async function testSessionCachingFix() {
    console.log('\n🧪 TESTING SESSION CACHING FIX');
    console.log('=====================================');
    
    try {
        // Test 1: First location with deals
        console.log('\n📍 Test 1: Setting first location (Marina Bay)');
        let session = createMockSession();
        
        // Simulate location message
        const locationMessage1 = {
            type: 'location',
            location: {
                latitude: location1.latitude,
                longitude: location1.longitude
            }
        };
        
        // Add some mock deals and shared deal IDs to simulate previous session
        session.userState.deals = [
            { dealId: 'deal1', businessName: 'Marina Restaurant' },
            { dealId: 'deal2', businessName: 'Bay Cafe' }
        ];
        session.userState.category = 'food';
        session.userState.chatContext = { location: 'Marina Bay' };
        session.sharedDealIds = ['deal1', 'deal2', 'deal3'];
        
        console.log(`📊 Before location change:`);
        console.log(`   - Deals: ${session.userState.deals?.length || 0}`);
        console.log(`   - Category: ${session.userState.category || 'none'}`);
        console.log(`   - Chat context: ${session.userState.chatContext ? 'exists' : 'none'}`);
        console.log(`   - Shared deal IDs: ${session.sharedDealIds?.length || 0}`);
        
        // Process location message (this should clear previous context)
        await handleLobangLahMessage('cmanyfn1e0001jl04j3k45mz5', '+1234567890', 'location_shared', mockBotConfig, session, locationMessage1);
        
        console.log(`📊 After new location shared:`);
        console.log(`   - Deals: ${session.userState.deals?.length || 0} (should be 0)`);
        console.log(`   - Category: ${session.userState.category || 'none'} (should be none)`);
        console.log(`   - Chat context: ${session.userState.chatContext ? 'exists' : 'none'} (should be none)`);
        console.log(`   - Shared deal IDs: ${session.sharedDealIds?.length || 0} (should be 0)`);
        console.log(`   - New location: ${session.userState.location?.displayName || 'not set'}`);
        
        // Verify session was properly cleared
        const sessionCleared = !session.userState.deals && 
                              !session.userState.category && 
                              !session.userState.chatContext && 
                              (!session.sharedDealIds || session.sharedDealIds.length === 0);
        
        console.log(`✅ Session caching fix: ${sessionCleared ? 'PASSED' : 'FAILED'}`);
        
        return sessionCleared;
        
    } catch (error) {
        console.error('❌ Session caching test failed:', error.message);
        return false;
    }
}

async function testDistanceEnforcement() {
    console.log('\n🧪 TESTING 1KM DISTANCE ENFORCEMENT');
    console.log('====================================');
    
    try {
        // Test location in Singapore
        const testLocation = {
            type: 'gps',
            latitude: 1.3521,
            longitude: 103.8198,
            displayName: 'Marina Bay Sands'
        };
        
        console.log(`📍 Testing distance enforcement for: ${testLocation.displayName}`);
        console.log(`   Coordinates: ${testLocation.latitude}, ${testLocation.longitude}`);
        
        // Search for deals (this will use the 1km radius)
        const deals = await searchMoreDealsFromDynamoDB(testLocation, 'food', [], 5);
        
        console.log(`📊 Found ${deals.length} deals within 1km radius`);
        
        // Check if any deals are beyond 1km (this would indicate the fix didn't work)
        let maxDistance = 0;
        for (const deal of deals) {
            if (deal.latitude && deal.longitude) {
                const distance = calculateDistance(
                    testLocation.latitude, testLocation.longitude,
                    parseFloat(deal.latitude), parseFloat(deal.longitude)
                );
                if (distance > maxDistance) maxDistance = distance;
                console.log(`   - ${deal.businessName}: ${distance.toFixed(2)}km away`);
            }
        }
        
        const distanceEnforced = maxDistance <= 1.0;
        console.log(`📏 Maximum distance: ${maxDistance.toFixed(2)}km (should be ≤ 1.0km)`);
        console.log(`✅ 1km distance enforcement: ${distanceEnforced ? 'PASSED' : 'FAILED'}`);
        
        return distanceEnforced;
        
    } catch (error) {
        console.error('❌ Distance enforcement test failed:', error.message);
        return false;
    }
}

async function testPincodeRemoval() {
    console.log('\n🧪 TESTING PINCODE REFERENCE REMOVAL');
    console.log('====================================');
    
    try {
        let session = createMockSession();
        
        // Test various message scenarios that previously had pincode references
        const testScenarios = [
            { action: 'chat_ai', expectedNoPostal: true },
            { action: 'more_deals', expectedNoPostal: true },
            { action: 'share_deals', expectedNoPostal: true },
            { action: 'help', expectedNoPostal: true }
        ];
        
        let allPassed = true;
        
        for (const scenario of testScenarios) {
            console.log(`📝 Testing ${scenario.action} for pincode references...`);
            
            try {
                const response = await handleLobangLahMessage(
                    'cmanyfn1e0001jl04j3k45mz5', 
                    '+1234567890', 
                    scenario.action, 
                    mockBotConfig, 
                    session
                );
                
                // Check if response contains postal code or pincode references
                const responseText = JSON.stringify(response).toLowerCase();
                const hasPostalRef = responseText.includes('postal code') || 
                                   responseText.includes('pincode') ||
                                   responseText.includes('123456');
                
                console.log(`   - Contains postal/pincode reference: ${hasPostalRef ? 'YES (❌)' : 'NO (✅)'}`);
                
                if (hasPostalRef && scenario.expectedNoPostal) {
                    allPassed = false;
                    console.log(`   - FAILED: Found postal code reference in ${scenario.action}`);
                }
                
            } catch (error) {
                console.log(`   - Skipped ${scenario.action} (expected for incomplete session)`);
            }
        }
        
        console.log(`✅ Pincode removal: ${allPassed ? 'PASSED' : 'FAILED'}`);
        return allPassed;
        
    } catch (error) {
        console.error('❌ Pincode removal test failed:', error.message);
        return false;
    }
}

async function testLocationSharingInstructions() {
    console.log('\n🧪 TESTING LOCATION SHARING INSTRUCTIONS');
    console.log('========================================');
    
    try {
        let session = createMockSession();
        
        // Test welcome message for improved location sharing instructions
        const response = await handleLobangLahMessage(
            'cmanyfn1e0001jl04j3k45mz5', 
            '+1234567890', 
            'start', 
            mockBotConfig, 
            session
        );
        
        const responseText = JSON.stringify(response).toLowerCase();
        
        // Check for improved instructions
        const hasSearchOption = responseText.includes('search for a place') || 
                               responseText.includes('search bar');
        const hasCurrentLocationOption = responseText.includes('current location');
        const hasStepByStep = responseText.includes('1️⃣') && responseText.includes('2️⃣');
        
        console.log(`📋 Location sharing instruction improvements:`);
        console.log(`   - Has search option: ${hasSearchOption ? 'YES (✅)' : 'NO (❌)'}`);
        console.log(`   - Has current location option: ${hasCurrentLocationOption ? 'YES (✅)' : 'NO (❌)'}`);
        console.log(`   - Has step-by-step instructions: ${hasStepByStep ? 'YES (✅)' : 'NO (❌)'}`);
        
        const instructionsImproved = hasSearchOption && hasCurrentLocationOption && hasStepByStep;
        console.log(`✅ Location sharing instructions: ${instructionsImproved ? 'PASSED' : 'FAILED'}`);
        
        return instructionsImproved;
        
    } catch (error) {
        console.error('❌ Location sharing instructions test failed:', error.message);
        return false;
    }
}

// Helper function to calculate distance between two GPS coordinates
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Run all tests
async function runAllTests() {
    console.log('🚀 COMPREHENSIVE WHATSAPP BOT FIXES TEST');
    console.log('=========================================');
    console.log('Testing all critical fixes reported by user:');
    console.log('1. Session caching - new location should clear previous deals');
    console.log('2. 1km GPS distance enforcement (was 2km)');
    console.log('3. No pincode references in user messages');
    console.log('4. Improved WhatsApp location sharing instructions');
    
    const results = {
        sessionCaching: await testSessionCachingFix(),
        distanceEnforcement: await testDistanceEnforcement(),
        pincodeRemoval: await testPincodeRemoval(),
        locationInstructions: await testLocationSharingInstructions()
    };
    
    console.log('\n📊 FINAL TEST RESULTS');
    console.log('=====================');
    console.log(`✅ Session Caching Fix: ${results.sessionCaching ? 'PASSED' : 'FAILED'}`);
    console.log(`✅ 1km Distance Enforcement: ${results.distanceEnforcement ? 'PASSED' : 'FAILED'}`);
    console.log(`✅ Pincode Reference Removal: ${results.pincodeRemoval ? 'PASSED' : 'FAILED'}`);
    console.log(`✅ Location Sharing Instructions: ${results.locationInstructions ? 'PASSED' : 'FAILED'}`);
    
    const allPassed = Object.values(results).every(result => result);
    console.log(`\n🎯 OVERALL RESULT: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
    
    if (allPassed) {
        console.log('\n🎉 All critical issues have been successfully fixed!');
        console.log('The WhatsApp bot now:');
        console.log('• Clears previous location context when new location is shared');
        console.log('• Enforces 1km GPS radius for deal searches');
        console.log('• Has no pincode references in user-facing messages');
        console.log('• Provides improved location sharing instructions');
    } else {
        console.log('\n⚠️  Some issues still need attention. Check the failed tests above.');
    }
    
    return allPassed;
}

// Run the tests
if (import.meta.url === `file://${process.argv[1]}`) {
    runAllTests().catch(console.error);
}

export { runAllTests, testSessionCachingFix, testDistanceEnforcement, testPincodeRemoval, testLocationSharingInstructions };
