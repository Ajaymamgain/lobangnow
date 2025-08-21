// Viral Content Scraper & Social Media Listener
import OpenAI from 'openai';
import fetch from 'node-fetch';
import { DynamoDBClient, PutItemCommand, QueryCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

/**
 * VIRAL CONTENT DISCOVERY SYSTEM
 * =============================
 * 
 * This system discovers trending viral posts about food deals in Singapore by:
 * 1. Google Search API - Find viral food posts and trending hashtags
 * 2. Social Media Monitoring - Track hashtags and keywords
 * 3. AI Analysis - Analyze what makes content viral
 * 4. Pattern Recognition - Learn from successful viral content
 * 5. Content Inspiration - Generate similar viral content
 */

/**
 * Scrape viral food content using Google Search API
 */
export async function scrapeViralFoodContent(searchConfig) {
    try {
        console.log('[ViralScraper] Starting viral content discovery...');
        
        const viralContent = [];
        
        // Define Singapore food-specific search terms
        const searchTerms = [
            'Singapore food deals viral',
            'SGFood trending hashtag',
            'lobang alert food Singapore',
            'viral food post Singapore',
            'Singapore restaurant promotion trending',
            'SGEats viral TikTok',
            'Singapore food discount viral Instagram',
            'trending Singapore food deals',
            'viral Singapore restaurant post',
            'SGFood influencer post'
        ];
        
        // Search for viral content using each term
        for (const term of searchTerms) {
            const searchResults = await searchViralContent(term, searchConfig);
            viralContent.push(...searchResults);
        }
        
        // Analyze and rank content by viral potential
        const analyzedContent = await analyzeViralPatterns(viralContent, searchConfig);
        
        // Store discoveries in DynamoDB
        await storeViralDiscoveries(analyzedContent);
        
        console.log(`[ViralScraper] Discovered ${analyzedContent.length} viral content pieces`);
        return analyzedContent;
        
    } catch (error) {
        console.error('[ViralScraper] Error scraping viral content:', error);
        return [];
    }
}

/**
 * Search for viral content using Google Search API
 */
async function searchViralContent(searchTerm, searchConfig) {
    try {
        const { googleSearchApiKey, googleSearchToken } = searchConfig;
        
        if (!googleSearchApiKey || !googleSearchToken) {
            console.warn('[ViralScraper] Google Search API credentials missing');
            return [];
        }
        
        // Use Google Custom Search API to find viral content
        const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${googleSearchApiKey}&cx=${googleSearchToken}&q=${encodeURIComponent(searchTerm)}&num=10&sort=date`;
        
        const response = await fetch(searchUrl);
        const data = await response.json();
        
        if (!data.items) {
            console.log(`[ViralScraper] No results found for: ${searchTerm}`);
            return [];
        }
        
        // Extract relevant content
        const content = data.items.map(item => ({
            title: item.title,
            snippet: item.snippet,
            link: item.link,
            displayLink: item.displayLink,
            searchTerm: searchTerm,
            foundAt: new Date().toISOString(),
            source: detectSourcePlatform(item.link),
            viralIndicators: extractViralIndicators(item.title, item.snippet)
        }));
        
        console.log(`[ViralScraper] Found ${content.length} results for: ${searchTerm}`);
        return content;
        
    } catch (error) {
        console.error(`[ViralScraper] Error searching for: ${searchTerm}`, error);
        return [];
    }
}

/**
 * Detect source platform from URL
 */
function detectSourcePlatform(url) {
    const urlLower = url.toLowerCase();
    
    if (urlLower.includes('facebook.com')) return 'facebook';
    if (urlLower.includes('instagram.com')) return 'instagram';
    if (urlLower.includes('tiktok.com')) return 'tiktok';
    if (urlLower.includes('twitter.com') || urlLower.includes('x.com')) return 'twitter';
    if (urlLower.includes('youtube.com')) return 'youtube';
    if (urlLower.includes('t.me') || urlLower.includes('telegram')) return 'telegram';
    if (urlLower.includes('reddit.com')) return 'reddit';
    if (urlLower.includes('xiaohongshu.com') || urlLower.includes('redbook')) return 'xiaohongshu';
    if (urlLower.includes('linkedin.com')) return 'linkedin';
    if (urlLower.includes('pinterest.com')) return 'pinterest';
    
    // Check for Singapore news/food sites
    if (urlLower.includes('mothership.sg')) return 'mothership';
    if (urlLower.includes('stomp.sg')) return 'stomp';
    if (urlLower.includes('sgag.sg')) return 'sgag';
    if (urlLower.includes('foodpanda.sg')) return 'foodpanda';
    if (urlLower.includes('grab.com')) return 'grab';
    if (urlLower.includes('zomato.com')) return 'zomato';
    
    return 'other';
}

/**
 * Extract viral indicators from content
 */
function extractViralIndicators(title, snippet) {
    const text = (title + ' ' + snippet).toLowerCase();
    const indicators = {
        urgencyWords: [],
        discountMentions: [],
        locationMentions: [],
        foodTypes: [],
        viralWords: [],
        emotionalTriggers: [],
        timeReferences: []
    };
    
    // Urgency indicators
    const urgencyPatterns = ['limited time', 'today only', 'weekend only', 'while stocks last', 'hurry', 'running out', 'last chance', 'ending soon'];
    urgencyPatterns.forEach(pattern => {
        if (text.includes(pattern)) indicators.urgencyWords.push(pattern);
    });
    
    // Discount mentions
    const discountPatterns = /(\d+)%|\$\d+|free|bogo|buy.*get|discount|promo|deal|offer|special|save/gi;
    const discountMatches = text.match(discountPatterns) || [];
    indicators.discountMentions = discountMatches;
    
    // Singapore locations
    const locationPatterns = ['orchard', 'marina bay', 'clarke quay', 'chinatown', 'little india', 'sentosa', 'bugis', 'tampines', 'jurong', 'hougang', 'bedok', 'serangoon'];
    locationPatterns.forEach(location => {
        if (text.includes(location)) indicators.locationMentions.push(location);
    });
    
    // Food types
    const foodPatterns = ['pasta', 'pizza', 'burger', 'sushi', 'ramen', 'curry', 'chicken', 'seafood', 'dessert', 'coffee', 'bubble tea', 'dimsum', 'hotpot', 'barbecue'];
    foodPatterns.forEach(food => {
        if (text.includes(food)) indicators.foodTypes.push(food);
    });
    
    // Viral words
    const viralPatterns = ['viral', 'trending', 'popular', 'must try', 'hidden gem', 'secret', 'exclusive', 'limited', 'sold out', 'queue', 'famous', 'legendary'];
    viralPatterns.forEach(word => {
        if (text.includes(word)) indicators.viralWords.push(word);
    });
    
    // Emotional triggers
    const emotionalPatterns = ['amazing', 'incredible', 'unbelievable', 'shocking', 'crazy', 'insane', 'mind-blowing', 'game-changer', 'life-changing', 'addictive'];
    emotionalPatterns.forEach(emotion => {
        if (text.includes(emotion)) indicators.emotionalTriggers.push(emotion);
    });
    
    // Time references
    const timePatterns = ['today', 'tomorrow', 'weekend', 'weekday', 'lunch', 'dinner', 'breakfast', 'supper', 'happy hour'];
    timePatterns.forEach(time => {
        if (text.includes(time)) indicators.timeReferences.push(time);
    });
    
    return indicators;
}

/**
 * Analyze viral patterns using AI
 */
async function analyzeViralPatterns(content, searchConfig) {
    try {
        const openai = new OpenAI({ apiKey: searchConfig.openAiApiKey });
        
        console.log('[ViralScraper] Analyzing viral patterns with AI...');
        
        const analyzedContent = [];
        
        // Analyze each piece of content
        for (const item of content) {
            try {
                const analysisPrompt = `Analyze this viral content about Singapore food deals and determine what makes it viral:

Title: ${item.title}
Snippet: ${item.snippet}
Source: ${item.source}
Platform: ${item.source}

Viral Indicators Found: ${JSON.stringify(item.viralIndicators)}

Please analyze:
1. Viral Score (1-10): How viral is this content?
2. Key Viral Elements: What specific words/phrases make it viral?
3. Emotional Triggers: What emotions does it evoke?
4. Call-to-Action: What action does it encourage?
5. Singapore-Specific: How does it appeal to Singaporeans?
6. Replication Strategy: How can we create similar viral content?

Respond in JSON format:
{
  "viralScore": 8,
  "keyElements": ["limited time", "50% off", "viral pasta"],
  "emotions": ["urgency", "excitement", "FOMO"],
  "callToAction": "Book now before it's gone",
  "singaporeAppeal": "Uses local slang, mentions MRT station",
  "replicationTips": ["Use urgency words", "Include percentage discount", "Mention location"]
}`;

                const completion = await openai.chat.completions.create({
                    model: "gpt-4",
                    messages: [{ role: "user", content: analysisPrompt }],
                    max_tokens: 500,
                    temperature: 0.3
                });

                const analysis = JSON.parse(completion.choices[0].message.content);
                
                analyzedContent.push({
                    ...item,
                    aiAnalysis: analysis,
                    analyzedAt: new Date().toISOString()
                });
                
                // Small delay to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (error) {
                console.error('[ViralScraper] Error analyzing item:', error);
                // Add item without analysis
                analyzedContent.push({
                    ...item,
                    aiAnalysis: { viralScore: 5, error: 'Analysis failed' },
                    analyzedAt: new Date().toISOString()
                });
            }
        }
        
        // Sort by viral score
        analyzedContent.sort((a, b) => (b.aiAnalysis?.viralScore || 0) - (a.aiAnalysis?.viralScore || 0));
        
        console.log(`[ViralScraper] Analyzed ${analyzedContent.length} content pieces`);
        return analyzedContent;
        
    } catch (error) {
        console.error('[ViralScraper] Error in AI analysis:', error);
        return content; // Return unanalyzed content
    }
}

/**
 * Store viral discoveries in DynamoDB
 */
async function storeViralDiscoveries(discoveries) {
    try {
        const dynamodb = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-1' });
        
        for (const discovery of discoveries) {
            const discoveryId = `viral_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            const item = {
                discoveryId,
                title: discovery.title,
                snippet: discovery.snippet,
                link: discovery.link,
                source: discovery.source,
                searchTerm: discovery.searchTerm,
                viralIndicators: discovery.viralIndicators,
                aiAnalysis: discovery.aiAnalysis,
                foundAt: discovery.foundAt,
                analyzedAt: discovery.analyzedAt
            };
            
            await dynamodb.send(new PutItemCommand({
                TableName: 'ViralDiscoveries',
                Item: marshall(item)
            }));
        }
        
        console.log(`[ViralScraper] Stored ${discoveries.length} discoveries in DynamoDB`);
        
    } catch (error) {
        console.error('[ViralScraper] Error storing discoveries:', error);
    }
}

/**
 * Monitor specific hashtags for viral content
 */
export async function monitorHashtagsForViral(hashtags, searchConfig) {
    try {
        console.log('[ViralListener] Starting hashtag monitoring...');
        
        const monitoringResults = [];
        
        // Monitor each hashtag
        for (const hashtag of hashtags) {
            const searchTerm = `${hashtag} Singapore food viral`;
            const results = await searchViralContent(searchTerm, searchConfig);
            
            // Filter for recent content (last 7 days)
            const recentResults = results.filter(item => {
                const foundDate = new Date(item.foundAt);
                const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                return foundDate > weekAgo;
            });
            
            monitoringResults.push({
                hashtag,
                contentCount: recentResults.length,
                content: recentResults,
                lastChecked: new Date().toISOString()
            });
        }
        
        // Store monitoring results
        await storeHashtagMonitoring(monitoringResults);
        
        console.log(`[ViralListener] Monitored ${hashtags.length} hashtags`);
        return monitoringResults;
        
    } catch (error) {
        console.error('[ViralListener] Error monitoring hashtags:', error);
        return [];
    }
}

/**
 * Store hashtag monitoring results
 */
async function storeHashtagMonitoring(results) {
    try {
        const dynamodb = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-1' });
        
        for (const result of results) {
            const monitoringId = `hashtag_${Date.now()}_${result.hashtag.replace('#', '')}`;
            
            await dynamodb.send(new PutItemCommand({
                TableName: 'HashtagMonitoring',
                Item: marshall({
                    monitoringId,
                    hashtag: result.hashtag,
                    contentCount: result.contentCount,
                    content: result.content,
                    lastChecked: result.lastChecked
                })
            }));
        }
        
        console.log(`[ViralListener] Stored monitoring results for ${results.length} hashtags`);
        
    } catch (error) {
        console.error('[ViralListener] Error storing monitoring results:', error);
    }
}

/**
 * Get viral content inspiration for deal creation
 */
export async function getViralInspiration(dealData, searchConfig) {
    try {
        console.log('[ViralInspiration] Getting viral inspiration for deal...');
        
        // Search for similar viral content
        const searchTerms = [
            `${dealData.restaurant.name} viral`,
            `${dealData.dealDescription} Singapore viral`,
            `${dealData.targetAudience} food deals viral`,
            `Singapore ${dealData.restaurant.address.split(',')[1]?.trim()} viral food`
        ];
        
        const inspirationContent = [];
        
        for (const term of searchTerms) {
            const results = await searchViralContent(term, searchConfig);
            inspirationContent.push(...results);
        }
        
        // Analyze inspiration content
        const analyzedInspiration = await analyzeViralPatterns(inspirationContent, searchConfig);
        
        // Extract viral patterns
        const viralPatterns = extractViralPatterns(analyzedInspiration);
        
        // Generate AI recommendations
        const recommendations = await generateViralRecommendations(dealData, viralPatterns, searchConfig);
        
        return {
            inspirationContent: analyzedInspiration.slice(0, 10), // Top 10
            viralPatterns,
            recommendations
        };
        
    } catch (error) {
        console.error('[ViralInspiration] Error getting inspiration:', error);
        return {
            inspirationContent: [],
            viralPatterns: {},
            recommendations: []
        };
    }
}

/**
 * Extract viral patterns from analyzed content
 */
function extractViralPatterns(analyzedContent) {
    const patterns = {
        topWords: {},
        topEmotions: {},
        topCallToActions: {},
        averageViralScore: 0,
        commonElements: {},
        successfulFormats: []
    };
    
    let totalScore = 0;
    let scoreCount = 0;
    
    analyzedContent.forEach(item => {
        const analysis = item.aiAnalysis;
        if (!analysis) return;
        
        // Collect viral score
        if (analysis.viralScore) {
            totalScore += analysis.viralScore;
            scoreCount++;
        }
        
        // Collect key elements
        if (analysis.keyElements) {
            analysis.keyElements.forEach(element => {
                patterns.topWords[element] = (patterns.topWords[element] || 0) + 1;
            });
        }
        
        // Collect emotions
        if (analysis.emotions) {
            analysis.emotions.forEach(emotion => {
                patterns.topEmotions[emotion] = (patterns.topEmotions[emotion] || 0) + 1;
            });
        }
        
        // Collect call to actions
        if (analysis.callToAction) {
            patterns.topCallToActions[analysis.callToAction] = (patterns.topCallToActions[analysis.callToAction] || 0) + 1;
        }
        
        // Collect replication tips
        if (analysis.replicationTips) {
            analysis.replicationTips.forEach(tip => {
                patterns.commonElements[tip] = (patterns.commonElements[tip] || 0) + 1;
            });
        }
    });
    
    patterns.averageViralScore = scoreCount > 0 ? totalScore / scoreCount : 5;
    
    return patterns;
}

/**
 * Generate viral recommendations using AI
 */
async function generateViralRecommendations(dealData, viralPatterns, searchConfig) {
    try {
        const openai = new OpenAI({ apiKey: searchConfig.openAiApiKey });
        
        const recommendationPrompt = `Based on viral content analysis, provide recommendations for making this deal viral:

Deal Details:
- Restaurant: ${dealData.restaurant.name}
- Deal: ${dealData.dealDescription}
- Location: ${dealData.restaurant.address}
- Target: ${dealData.targetAudience}

Viral Patterns Found:
- Top Words: ${JSON.stringify(Object.keys(viralPatterns.topWords).slice(0, 10))}
- Top Emotions: ${JSON.stringify(Object.keys(viralPatterns.topEmotions).slice(0, 5))}
- Average Viral Score: ${viralPatterns.averageViralScore}
- Common Elements: ${JSON.stringify(Object.keys(viralPatterns.commonElements).slice(0, 10))}

Provide 5 specific viral recommendations in JSON format:
{
  "recommendations": [
    {
      "type": "caption_improvement",
      "suggestion": "Add urgency words like 'limited time' or 'while stocks last'",
      "impact": "high"
    }
  ]
}`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [{ role: "user", content: recommendationPrompt }],
            max_tokens: 600,
            temperature: 0.7
        });

        const response = JSON.parse(completion.choices[0].message.content);
        return response.recommendations || [];
        
    } catch (error) {
        console.error('[ViralInspiration] Error generating recommendations:', error);
        return [];
    }
}

/**
 * Scheduled viral content discovery job
 */
export async function runViralDiscoveryJob(searchConfig) {
    try {
        console.log('[ViralDiscovery] Starting scheduled viral discovery job...');
        
        // 1. Scrape viral food content
        const viralContent = await scrapeViralFoodContent(searchConfig);
        
        // 2. Monitor trending hashtags
        const trendingHashtags = [
            '#SGFood', '#SGDeals', '#LobangAlert', '#ViralEats',
            '#SingaporeFood', '#SGEats', '#FoodieFinds', '#SGFoodie',
            '#Halal', '#Vegetarian', '#StudentDeals', '#DateNight'
        ];
        
        const hashtagResults = await monitorHashtagsForViral(trendingHashtags, searchConfig);
        
        // 3. Create daily viral report
        const report = {
            jobId: `viral_job_${Date.now()}`,
            executedAt: new Date().toISOString(),
            viralContentFound: viralContent.length,
            hashtagsMonitored: trendingHashtags.length,
            topViralScore: viralContent[0]?.aiAnalysis?.viralScore || 0,
            summary: {
                topSources: extractTopSources(viralContent),
                trendingWords: extractTrendingWords(viralContent),
                viralStrategies: extractViralStrategies(viralContent)
            }
        };
        
        // Store report
        await storeDailyReport(report);
        
        console.log('[ViralDiscovery] Viral discovery job completed:', report);
        return report;
        
    } catch (error) {
        console.error('[ViralDiscovery] Error in viral discovery job:', error);
        return null;
    }
}

/**
 * Extract top sources from viral content
 */
function extractTopSources(content) {
    const sources = {};
    content.forEach(item => {
        sources[item.source] = (sources[item.source] || 0) + 1;
    });
    
    return Object.entries(sources)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([source, count]) => ({ source, count }));
}

/**
 * Extract trending words from viral content
 */
function extractTrendingWords(content) {
    const words = {};
    content.forEach(item => {
        if (item.aiAnalysis?.keyElements) {
            item.aiAnalysis.keyElements.forEach(element => {
                words[element] = (words[element] || 0) + 1;
            });
        }
    });
    
    return Object.entries(words)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .map(([word, count]) => ({ word, count }));
}

/**
 * Extract viral strategies from content
 */
function extractViralStrategies(content) {
    const strategies = {};
    content.forEach(item => {
        if (item.aiAnalysis?.replicationTips) {
            item.aiAnalysis.replicationTips.forEach(tip => {
                strategies[tip] = (strategies[tip] || 0) + 1;
            });
        }
    });
    
    return Object.entries(strategies)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([strategy, count]) => ({ strategy, count }));
}

/**
 * Store daily viral report
 */
async function storeDailyReport(report) {
    try {
        const dynamodb = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-1' });
        
        await dynamodb.send(new PutItemCommand({
            TableName: 'ViralReports',
            Item: marshall(report)
        }));
        
        console.log('[ViralDiscovery] Stored daily report:', report.jobId);
        
    } catch (error) {
        console.error('[ViralDiscovery] Error storing daily report:', error);
    }
}


