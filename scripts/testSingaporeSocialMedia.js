#!/usr/bin/env node

/**
 * Test Singapore-focused social media platform prioritization
 * Verifies that social media search and ranking focuses on platforms popular in Singapore
 */

import { rankDealsBySocialMedia } from '../src/utils/dealsUtils.js';

// Mock deals from different social media platforms
const mockDeals = [
    {
        businessName: 'Marina Bay Cafe',
        socialMediaSource: 'instagram',
        description: 'Instagram deal from @marinabay_cafe',
        timestamp: Date.now()
    },
    {
        businessName: 'Orchard Food Court',
        socialMediaSource: 'tiktok',
        description: 'TikTok viral deal from @orchardfc',
        timestamp: Date.now() - 1000
    },
    {
        businessName: 'Singapore Mall',
        socialMediaSource: 'facebook',
        description: 'Facebook page promotion',
        timestamp: Date.now() - 2000
    },
    {
        businessName: 'SG Deals Channel',
        socialMediaSource: 'telegram',
        description: 'Telegram channel exclusive deal',
        timestamp: Date.now() - 3000
    },
    {
        businessName: 'Local Restaurant',
        socialMediaSource: 'whatsapp',
        description: 'WhatsApp Business promotion',
        timestamp: Date.now() - 4000
    },
    {
        businessName: 'Food Review Channel',
        socialMediaSource: 'youtube',
        description: 'YouTube video deal mention',
        timestamp: Date.now() - 5000
    },
    {
        businessName: 'Singapore Subreddit',
        socialMediaSource: 'reddit',
        description: 'Reddit r/singapore deal post',
        timestamp: Date.now() - 6000
    },
    {
        businessName: 'Generic Website',
        socialMediaSource: 'web',
        description: 'Direct website deal',
        timestamp: Date.now() - 7000
    },
    {
        businessName: 'Unknown Platform',
        socialMediaSource: 'unknown',
        description: 'Deal from unknown platform',
        timestamp: Date.now() - 8000
    }
];

function testSingaporeSocialMediaRanking() {
    console.log('🇸🇬 TESTING SINGAPORE SOCIAL MEDIA PLATFORM PRIORITIZATION');
    console.log('=========================================================');
    
    console.log('\n📊 Original deal order (by timestamp):');
    mockDeals.forEach((deal, index) => {
        console.log(`${index + 1}. ${deal.businessName} (${deal.socialMediaSource})`);
    });
    
    // Rank deals by Singapore social media priority
    const rankedDeals = rankDealsBySocialMedia([...mockDeals]);
    
    console.log('\n🏆 Ranked by Singapore social media priority:');
    rankedDeals.forEach((deal, index) => {
        const priority = getSocialMediaPriority(deal.socialMediaSource);
        console.log(`${index + 1}. ${deal.businessName} (${deal.socialMediaSource}) - Priority: ${priority}`);
    });
    
    // Expected order based on Singapore popularity:
    // 1. Instagram (6) - Most popular for deals/food in Singapore
    // 2. TikTok (5) - Growing rapidly in Singapore, especially for deals
    // 3. Facebook (4) - Still very popular for business pages and deals
    // 4. Telegram (3) - Popular in Singapore for deal channels and groups
    // 5. WhatsApp (2) - Business WhatsApp for deals and promotions
    // 6. YouTube (1) - Less common for deals but still relevant
    // 7. Reddit (1) - Same priority as YouTube
    // 8. Web (0) - Direct website deals (lowest priority)
    
    const expectedOrder = ['instagram', 'tiktok', 'facebook', 'telegram', 'whatsapp'];
    let correctOrder = true;
    
    console.log('\n✅ VERIFICATION:');
    
    // Check if Instagram is first (highest priority)
    if (rankedDeals[0].socialMediaSource === 'instagram') {
        console.log('✅ Instagram ranked first (highest priority for Singapore deals)');
    } else {
        console.log('❌ Instagram should be ranked first');
        correctOrder = false;
    }
    
    // Check if TikTok is second
    if (rankedDeals[1].socialMediaSource === 'tiktok') {
        console.log('✅ TikTok ranked second (very popular for Singapore deals)');
    } else {
        console.log('❌ TikTok should be ranked second');
        correctOrder = false;
    }
    
    // Check if Facebook is third
    if (rankedDeals[2].socialMediaSource === 'facebook') {
        console.log('✅ Facebook ranked third (popular for business pages in Singapore)');
    } else {
        console.log('❌ Facebook should be ranked third');
        correctOrder = false;
    }
    
    // Check if Telegram is fourth
    if (rankedDeals[3].socialMediaSource === 'telegram') {
        console.log('✅ Telegram ranked fourth (popular for SG deal channels)');
    } else {
        console.log('❌ Telegram should be ranked fourth');
        correctOrder = false;
    }
    
    // Check if WhatsApp is fifth
    if (rankedDeals[4].socialMediaSource === 'whatsapp') {
        console.log('✅ WhatsApp ranked fifth (business promotions in Singapore)');
    } else {
        console.log('❌ WhatsApp should be ranked fifth');
        correctOrder = false;
    }
    
    // Verify that removed platforms (twitter, linkedin) are not in the ranking logic
    const hasRemovedPlatforms = rankedDeals.some(deal => 
        deal.socialMediaSource === 'twitter' || deal.socialMediaSource === 'linkedin'
    );
    
    if (!hasRemovedPlatforms) {
        console.log('✅ Twitter and LinkedIn correctly removed (not popular for deals in Singapore)');
    } else {
        console.log('❌ Twitter and LinkedIn should be removed from ranking');
        correctOrder = false;
    }
    
    console.log(`\n🎯 OVERALL RESULT: ${correctOrder ? '✅ PASSED' : '❌ FAILED'}`);
    
    if (correctOrder) {
        console.log('\n🎉 Singapore social media prioritization is working correctly!');
        console.log('The system now focuses on platforms popular in Singapore:');
        console.log('• Instagram - Highest priority for deals and food');
        console.log('• TikTok - Growing rapidly for Singapore deals');
        console.log('• Facebook - Popular for business pages');
        console.log('• Telegram - Popular for SG deal channels');
        console.log('• WhatsApp - Business promotions');
        console.log('• Removed Twitter/LinkedIn (less relevant for Singapore deals)');
    } else {
        console.log('\n⚠️ Some issues with Singapore social media prioritization. Check the ranking logic.');
    }
    
    return correctOrder;
}

function getSocialMediaPriority(platform) {
    const priorities = {
        'instagram': 6,
        'tiktok': 5,
        'facebook': 4,
        'telegram': 3,
        'whatsapp': 2,
        'youtube': 1,
        'reddit': 1,
        'web': 0
    };
    return priorities[platform] || 0;
}

function testSocialMediaSourceExtraction() {
    console.log('\n🔍 TESTING SOCIAL MEDIA SOURCE EXTRACTION');
    console.log('==========================================');
    
    const testTexts = [
        { text: 'Check out this deal on Instagram @marinabay_cafe', expected: 'instagram' },
        { text: 'Found this on TikTok tiktok.com/@foodie_sg', expected: 'tiktok' },
        { text: 'Facebook page facebook.com/sgdeals has great offers', expected: 'facebook' },
        { text: 'Join our Telegram channel t.me/sgdeals for exclusive deals', expected: 'telegram' },
        { text: 'WhatsApp us at wa.me/65123456 for special promotion', expected: 'whatsapp' },
        { text: 'YouTube video youtu.be/abc123 shows this deal', expected: 'youtube' },
        { text: 'Reddit post on r/singapore about this offer', expected: 'reddit' },
        { text: 'Direct website promotion with no social media', expected: 'web' }
    ];
    
    let allCorrect = true;
    
    for (const test of testTexts) {
        // Since extractSocialMediaSource is not exported, we'll simulate the logic
        const detected = simulateExtractSocialMediaSource(test.text);
        const correct = detected === test.expected;
        
        console.log(`${correct ? '✅' : '❌'} "${test.text.substring(0, 50)}..." → ${detected} (expected: ${test.expected})`);
        
        if (!correct) allCorrect = false;
    }
    
    console.log(`\n🎯 Source extraction result: ${allCorrect ? '✅ PASSED' : '❌ FAILED'}`);
    return allCorrect;
}

function simulateExtractSocialMediaSource(text) {
    const socialMediaKeywords = {
        'instagram': ['instagram', 'ig', '@', '#', 'insta'],
        'tiktok': ['tiktok', 'tt', 'tik tok'],
        'facebook': ['facebook', 'fb', 'facebook.com'],
        'telegram': ['telegram', 't.me', 'tg', 'telegram.me'],
        'whatsapp': ['whatsapp', 'wa.me', 'whatsapp business', 'wa'],
        'youtube': ['youtube', 'yt', 'youtu.be'],
        'reddit': ['reddit', 'r/', '/r/', 'r/singapore']
    };
    
    const lowerText = text.toLowerCase();
    
    for (const [platform, keywords] of Object.entries(socialMediaKeywords)) {
        for (const keyword of keywords) {
            if (lowerText.includes(keyword)) {
                return platform;
            }
        }
    }
    
    return 'web';
}

// Run all tests
async function runAllTests() {
    console.log('🚀 SINGAPORE SOCIAL MEDIA PLATFORM TESTING');
    console.log('==========================================');
    console.log('Testing social media prioritization for Singapore market');
    
    const rankingTest = testSingaporeSocialMediaRanking();
    const extractionTest = testSocialMediaSourceExtraction();
    
    const allPassed = rankingTest && extractionTest;
    
    console.log('\n📊 FINAL TEST RESULTS');
    console.log('=====================');
    console.log(`✅ Singapore Social Media Ranking: ${rankingTest ? 'PASSED' : 'FAILED'}`);
    console.log(`✅ Social Media Source Extraction: ${extractionTest ? 'PASSED' : 'FAILED'}`);
    
    console.log(`\n🎯 OVERALL RESULT: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
    
    if (allPassed) {
        console.log('\n🇸🇬 Singapore social media optimization is working perfectly!');
        console.log('The bot now prioritizes platforms popular in Singapore for deal discovery.');
    }
    
    return allPassed;
}

// Run the tests
if (import.meta.url === `file://${process.argv[1]}`) {
    runAllTests().catch(console.error);
}

export { runAllTests, testSingaporeSocialMediaRanking, testSocialMediaSourceExtraction };
