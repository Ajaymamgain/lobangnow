// Singapore-specific analytics and insights for LobangLah
import { DynamoDBClient, PutItemCommand, GetItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const dynamoClient = new DynamoDBClient({ region: 'ap-southeast-1' });

/**
 * Singapore deal trends and patterns
 */
export const singaporeDealTrends = {
    food: {
        peakHours: {
            breakfast: '7:00 AM - 9:00 AM',
            lunch: '11:30 AM - 2:00 PM',
            tea: '2:30 PM - 5:00 PM',
            dinner: '6:00 PM - 9:00 PM',
            supper: '10:00 PM - 2:00 AM'
        },
        popularDays: ['Friday', 'Saturday', 'Sunday'],
        bestDeals: ['1-for-1', 'set meals', 'happy hour', 'student discounts']
    },
    
    events: {
        peakDays: ['Friday', 'Saturday', 'Sunday'],
        popularTimes: ['Evening', 'Weekend'],
        bestDeals: ['early bird', 'group bookings', 'student prices', 'family packages']
    },
    
    fashion: {
        peakSeasons: ['Great Singapore Sale', 'Black Friday', 'Christmas', 'Chinese New Year'],
        popularDays: ['Saturday', 'Sunday'],
        bestDeals: ['clearance sales', 'member discounts', 'buy 2 get 1', 'flash sales']
    }
};

/**
 * Track user interaction for Singapore analytics
 */
export async function trackSingaporeInteraction(userId, interactionType, data = {}) {
    try {
        const timestamp = Date.now();
        const interaction = {
            userId,
            interactionType,
            timestamp,
            data,
            region: 'Singapore',
            source: 'LobangLah'
        };
        
        // Store in DynamoDB for analytics
        await dynamoClient.send(new PutItemCommand({
            TableName: 'LobangLahAnalytics',
            Item: marshall({
                pk: `USER#${userId}`,
                sk: `INTERACTION#${timestamp}`,
                ...interaction
            })
        }));
        
        console.log(`[SingaporeAnalytics] Tracked ${interactionType} for user ${userId}`);
        return true;
    } catch (error) {
        console.error('[SingaporeAnalytics] Error tracking interaction:', error);
        return false;
    }
}

/**
 * Get Singapore-specific deal insights
 */
export function getSingaporeDealInsights(category, location, timeOfDay) {
    const trends = singaporeDealTrends[category];
    if (!trends) return null;
    
    const hour = new Date().getHours();
    let timeInsight = "";
    let recommendation = "";
    
    // Time-based insights
    if (category === 'food') {
        if (hour >= 7 && hour < 11) {
            timeInsight = "🍳 Breakfast deals are hot right now!";
            recommendation = "Look for breakfast sets and coffee deals";
        } else if (hour >= 11 && hour < 15) {
            timeInsight = "🍽️ Lunch rush - perfect time for set meals!";
            recommendation = "Check for lunch specials and office worker deals";
        } else if (hour >= 15 && hour < 18) {
            timeInsight = "☕ Tea time deals are brewing!";
            recommendation = "High tea and afternoon snack offers";
        } else if (hour >= 18 && hour < 22) {
            timeInsight = "🍖 Dinner deals are sizzling!";
            recommendation = "Look for dinner promotions and family deals";
        } else {
            timeInsight = "🌙 Supper deals for night owls!";
            recommendation = "Late night food and delivery deals";
        }
    } else if (category === 'events') {
        const dayOfWeek = new Date().toLocaleDateString('en-US', { weekday: 'long' });
        if (['Friday', 'Saturday', 'Sunday'].includes(dayOfWeek)) {
            timeInsight = "🎉 Weekend events are popping!";
            recommendation = "Check for weekend specials and family packages";
        } else {
            timeInsight = "🎭 Weekday events with better prices!";
            recommendation = "Look for weekday discounts and early bird offers";
        }
    } else if (category === 'fashion') {
        const month = new Date().getMonth();
        if (month >= 5 && month <= 7) {
            timeInsight = "🛍️ Great Singapore Sale season!";
            recommendation = "Best time for fashion deals and discounts";
        } else if (month === 11) {
            timeInsight = "🎄 Christmas shopping deals!";
            recommendation = "Holiday sales and gift promotions";
        } else {
            timeInsight = "👗 Regular fashion deals available!";
            recommendation = "Check for clearance and member discounts";
        }
    }
    
    return {
        timeInsight,
        recommendation,
        bestDeals: trends.bestDeals,
        peakTimes: trends.peakHours || trends.peakDays || trends.popularTimes
    };
}

/**
 * Generate Singapore-specific deal recommendations
 */
export function generateSingaporeRecommendations(userHistory = [], currentCategory, location) {
    const recommendations = [];
    
    // Based on location
    if (location && location.area) {
        const areaInsights = {
            'Orchard Road': 'High-end shopping and dining deals',
            'Marina Bay': 'Luxury and entertainment offers',
            'Chinatown': 'Traditional and cultural deals',
            'Little India': 'Authentic Indian cuisine and shopping',
            'Bugis': 'Youth-oriented fashion and food',
            'Tampines': 'Family-friendly deals and activities',
            'Jurong East': 'Shopping mall and entertainment deals',
            'Woodlands': 'Northern Singapore deals and activities'
        };
        
        if (areaInsights[location.area]) {
            recommendations.push(`📍 ${location.area}: ${areaInsights[location.area]}`);
        }
    }
    
    // Based on category
    const categoryTips = {
        food: [
            "🍽️ Check for set meal deals",
            "☕ Look for happy hour promotions",
            "🎓 Student discounts available",
            "👥 Group dining offers"
        ],
        events: [
            "🎫 Early bird tickets often cheaper",
            "👨‍👩‍👧‍👦 Family packages available",
            "🎓 Student and senior discounts",
            "🎪 Weekend events more expensive"
        ],
        fashion: [
            "🛍️ End-of-season sales best deals",
            "💳 Member discounts available",
            "🎓 Student prices at many stores",
            "⚡ Flash sales happen frequently"
        ]
    };
    
    if (categoryTips[currentCategory]) {
        recommendations.push(...categoryTips[currentCategory]);
    }
    
    return recommendations;
}

/**
 * Singapore-specific deal scoring
 */
export function scoreSingaporeDeal(deal, category, userPreferences = {}) {
    let score = 0;
    
    // Base score
    score += 10;
    
    // Category-specific scoring
    if (category === 'food') {
        if (deal.title?.toLowerCase().includes('1-for-1')) score += 20;
        if (deal.title?.toLowerCase().includes('set meal')) score += 15;
        if (deal.title?.toLowerCase().includes('happy hour')) score += 10;
        if (deal.title?.toLowerCase().includes('student')) score += 8;
    } else if (category === 'events') {
        if (deal.title?.toLowerCase().includes('early bird')) score += 15;
        if (deal.title?.toLowerCase().includes('family')) score += 12;
        if (deal.title?.toLowerCase().includes('student')) score += 10;
        if (deal.title?.toLowerCase().includes('group')) score += 8;
    } else if (category === 'fashion') {
        if (deal.title?.toLowerCase().includes('sale')) score += 15;
        if (deal.title?.toLowerCase().includes('clearance')) score += 12;
        if (deal.title?.toLowerCase().includes('member')) score += 10;
        if (deal.title?.toLowerCase().includes('student')) score += 8;
    }
    
    // Location scoring
    if (deal.address) {
        const popularAreas = ['Orchard', 'Marina Bay', 'Chinatown', 'Bugis', 'Tampines'];
        popularAreas.forEach(area => {
            if (deal.address.toLowerCase().includes(area.toLowerCase())) {
                score += 5;
            }
        });
    }
    
    // Price scoring
    if (deal.price && deal.price !== 'Contact for price') {
        score += 5;
    }
    
    // Validity scoring
    if (deal.validUntil && new Date(deal.validUntil) > new Date()) {
        score += 3;
    }
    
    return score;
}

/**
 * Get Singapore market insights
 */
export function getSingaporeMarketInsights() {
    const currentDate = new Date();
    const month = currentDate.getMonth();
    const dayOfWeek = currentDate.getDay();
    
    const insights = {
        season: '',
        events: [],
        tips: []
    };
    
    // Seasonal insights
    if (month >= 5 && month <= 7) {
        insights.season = 'Great Singapore Sale';
        insights.events.push('Great Singapore Sale', 'School Holidays');
        insights.tips.push('Best time for fashion and electronics deals', 'Shopping malls have extended hours');
    } else if (month === 11) {
        insights.season = 'Christmas Shopping';
        insights.events.push('Christmas', 'Black Friday', 'Cyber Monday');
        insights.tips.push('Gift deals and promotions everywhere', 'Book events early for Christmas');
    } else if (month === 0 || month === 1) {
        insights.season = 'Chinese New Year';
        insights.events.push('Chinese New Year', 'Lunar New Year');
        insights.tips.push('Traditional food deals available', 'Shopping for new year items');
    }
    
    // Day of week insights
    if (dayOfWeek === 5 || dayOfWeek === 6) {
        insights.tips.push('Weekend deals are more expensive', 'Book events early for weekends');
    } else {
        insights.tips.push('Weekday deals often cheaper', 'Less crowded for shopping and dining');
    }
    
    return insights;
} 