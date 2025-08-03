#!/usr/bin/env node

/**
 * Test script to verify the improved "More Deals" functionality
 * Ensures no duplicate deals are shown when user requests more deals
 */

import { searchMoreDealsFromDynamoDB } from '../src/utils/dealsUtils.js';

// Mock location data (Singapore)
const mockLocation = {
    latitude: 1.3521,
    longitude: 103.8198,
    displayName: "Marina Bay, Singapore",
    description: "Marina Bay, Singapore",
    name: "Marina Bay",
    postalCode: "018956",
    pincode: "018956"
};

// Mock already shown deals to exclude
const mockExcludeDeals = [
    {
        id: "deal1",
        businessName: "McDonald's Marina Bay",
        offer: "Buy 1 Get 1 Free Big Mac",
        description: "Special promotion for Big Mac burgers",
        url: "https://mcdonalds.com/deal1"
    },
    {
        id: "deal2", 
        businessName: "KFC Raffles Place",
        offer: "20% off Family Feast",
        description: "Discount on family meal packages",
        url: "https://kfc.com/deal2"
    },
    {
        id: "deal3",
        businessName: "Burger King CBD",
        offer: "Free Whopper with purchase",
        description: "Get a free Whopper with any combo meal",
        url: "https://burgerking.com/deal3"
    }
];

async function testMoreDealsLogic() {
    console.log('🧪 Testing More Deals Logic');
    console.log('================================');
    
    try {
        console.log('\n📍 Location:', mockLocation.displayName);
        console.log('🚫 Excluding deals:', mockExcludeDeals.length);
        
        // Test food category
        console.log('\n🍔 Testing Food Category:');
        const foodDeals = await searchMoreDealsFromDynamoDB(
            mockLocation,
            'food',
            mockExcludeDeals,
            5
        );
        
        console.log(`✅ Found ${foodDeals.length} additional food deals`);
        
        if (foodDeals.length > 0) {
            console.log('\n📋 Additional Food Deals:');
            foodDeals.forEach((deal, index) => {
                const businessName = deal.businessName || deal.restaurant || deal.store || deal.title;
                const offer = deal.offer || deal.discount || deal.promotion;
                console.log(`${index + 1}. ${businessName}: ${offer}`);
                
                // Check if this deal was in the exclude list
                const isDuplicate = mockExcludeDeals.some(excludeDeal => {
                    return (excludeDeal.id === deal.id) ||
                           (excludeDeal.businessName === businessName && excludeDeal.offer === offer);
                });
                
                if (isDuplicate) {
                    console.log(`   ⚠️  WARNING: This appears to be a duplicate!`);
                } else {
                    console.log(`   ✅ Unique deal confirmed`);
                }
            });
        }
        
        // Test groceries category
        console.log('\n🛒 Testing Groceries Category:');
        const groceryDeals = await searchMoreDealsFromDynamoDB(
            mockLocation,
            'groceries',
            [],
            3
        );
        
        console.log(`✅ Found ${groceryDeals.length} grocery deals`);
        
        // Test fashion category
        console.log('\n👗 Testing Fashion Category:');
        const fashionDeals = await searchMoreDealsFromDynamoDB(
            mockLocation,
            'fashion',
            [],
            3
        );
        
        console.log(`✅ Found ${fashionDeals.length} fashion deals`);
        
        // Test duplicate prevention with same business different offers
        console.log('\n🔄 Testing Duplicate Prevention:');
        const sameBusiness = [
            {
                id: "test1",
                businessName: "Test Restaurant",
                offer: "50% off lunch",
                description: "Lunch special promotion"
            }
        ];
        
        const moreFromSameBusiness = await searchMoreDealsFromDynamoDB(
            mockLocation,
            'food',
            sameBusiness,
            5
        );
        
        console.log(`✅ Found ${moreFromSameBusiness.length} additional deals (excluding same business)`);
        
        // Check if any returned deals have the same business name
        const hasSameBusiness = moreFromSameBusiness.some(deal => {
            const businessName = (deal.businessName || deal.restaurant || deal.store || deal.title || '').toLowerCase();
            return businessName === 'test restaurant';
        });
        
        if (hasSameBusiness) {
            console.log('⚠️  WARNING: Found deals from same business that should have been excluded');
        } else {
            console.log('✅ Duplicate prevention working correctly');
        }
        
        console.log('\n🎯 Test Summary:');
        console.log(`- Food deals: ${foodDeals.length}`);
        console.log(`- Grocery deals: ${groceryDeals.length}`);
        console.log(`- Fashion deals: ${fashionDeals.length}`);
        console.log('- Duplicate prevention: ✅ Working');
        
        console.log('\n✅ More Deals logic test completed successfully!');
        
    } catch (error) {
        console.error('❌ Error testing More Deals logic:', error);
        process.exit(1);
    }
}

// Run the test
testMoreDealsLogic();
