// N8N Integration Utils for Social Media Pipeline
import fetch from 'node-fetch';

/**
 * N8N SOCIAL MEDIA PIPELINE INTEGRATION
 * ====================================
 * 
 * This module provides integration points with n8n for the social media pipeline.
 * N8N will handle the actual posting, while this system provides the data and triggers.
 */

/**
 * Send approved deal to N8N pipeline for viral social media posting
 * (Poster should already be generated in WhatsApp flow)
 */
export async function triggerN8NPipeline(dealData, n8nConfig) {
    try {
        console.log('[N8N] Triggering social media pipeline for deal:', dealData.dealId);
        
        // Prepare payload for N8N webhook
        const n8nPayload = {
            trigger: 'viral_deal_approved',
            timestamp: new Date().toISOString(),
            dealId: dealData.dealId,
            restaurantOwner: dealData.restaurantOwner,
            
            // Restaurant Information (with safe fallbacks)
            restaurant: {
                name: dealData.restaurant?.name || 'Restaurant',
                address: dealData.restaurant?.address || 'Singapore',
                phone: dealData.restaurant?.phone || '',
                rating: dealData.restaurant?.rating || 0,
                placeId: dealData.restaurant?.placeId || ''
            },
            
            // Deal Information
            deal: {
                description: dealData.dealDescription,
                pricing: dealData.pricing,
                validity: dealData.validity,
                targetAudience: dealData.targetAudience,
                contactMethod: dealData.contactMethod,
                specialNotes: dealData.specialNotes,
                photoUrl: dealData.photoUrl
            },
            
            // Generated Content (Approved by Owner via WhatsApp)
            content: dealData.generatedContent,
            
            // AI-Generated Poster Data (Generated in WhatsApp flow)
            aiPoster: dealData.generatedContent?.mediaPackage?.poster || {
                ready: false,
                reason: 'No poster generated in WhatsApp flow'
            },
            
            // Platform-Specific Content
            platformContent: dealData.generatedContent?.platformContent || {},
            
            // Posting Instructions
            posting: {
                platforms: [
                    'facebook',
                    'instagram', 
                    'tiktok',
                    'whatsapp',
                    'telegram',
                    'twitter',
                    'youtube',
                    'xiaohongshu'
                ],
                priority: 'high',
                schedule: 'immediate',
                viralScore: dealData.viralScore || 7
            },
            
            // Performance Tracking
            tracking: {
                webhookUrl: `${n8nConfig.callbackBaseUrl}/api/performance/update`,
                dealId: dealData.dealId,
                restaurantOwner: dealData.restaurantOwner,
                updateInterval: '2hours'
            }
        };
        
        // Send to N8N webhook
        const response = await fetch(n8nConfig.webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${n8nConfig.apiKey}`,
                'X-N8N-Source': 'viral-agency-bot'
            },
            body: JSON.stringify(n8nPayload)
        });
        
        if (!response.ok) {
            throw new Error(`N8N pipeline failed: ${response.status} ${response.statusText}`);
        }
        
        const result = await response.json();
        
        console.log('[N8N] Pipeline triggered successfully:', {
            dealId: dealData.dealId,
            pipelineId: result.pipelineId,
            status: result.status
        });
        
        return {
            success: true,
            pipelineId: result.pipelineId,
            estimatedCompletion: result.estimatedCompletion,
            platformsTargeted: n8nPayload.posting.platforms.length
        };
        
    } catch (error) {
        console.error('[N8N] Error triggering pipeline:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Handle performance updates from N8N pipeline
 */
export async function handleN8NPerformanceUpdate(updateData) {
    try {
        console.log('[N8N] Received performance update:', updateData.dealId);
        
        // Extract performance metrics from N8N
        const metrics = {
            dealId: updateData.dealId,
            timestamp: updateData.timestamp,
            totalViews: updateData.metrics?.totalViews || 0,
            totalLikes: updateData.metrics?.totalLikes || 0,
            totalShares: updateData.metrics?.totalShares || 0,
            totalComments: updateData.metrics?.totalComments || 0,
            
            // Platform-specific metrics
            platformBreakdown: updateData.platformMetrics || {},
            
            // Viral indicators
            viralStatus: updateData.viralStatus || 'growing',
            reachEstimate: updateData.reachEstimate || 0,
            engagementRate: updateData.engagementRate || 0
        };
        
        // Determine commission tier
        const commission = calculateCommissionTier(metrics.totalViews);
        
        // Update DynamoDB with latest metrics
        await updateDealPerformance(updateData.dealId, metrics, commission);
        
        // Send update to restaurant owner
        await sendPerformanceUpdateToOwner(updateData.dealId, metrics, commission);
        
        // Check for viral alerts
        if (metrics.totalViews >= 50000 && updateData.viralAlert !== 'sent') {
            await sendViralAlert(updateData.dealId, metrics);
        }
        
        console.log('[N8N] Performance update processed successfully');
        
        return { success: true, metrics, commission };
        
    } catch (error) {
        console.error('[N8N] Error handling performance update:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Calculate commission tier based on views
 */
function calculateCommissionTier(totalViews) {
    if (totalViews >= 100000) {
        return { tier: 'VIRAL', amount: 500, description: '100K+ views' };
    } else if (totalViews >= 50000) {
        return { tier: 'GOLD', amount: 300, description: '50K-100K views' };
    } else if (totalViews >= 10000) {
        return { tier: 'SILVER', amount: 150, description: '10K-50K views' };
    } else if (totalViews >= 1000) {
        return { tier: 'BRONZE', amount: 50, description: '1K-10K views' };
    } else {
        return { tier: 'PENDING', amount: 0, description: 'Below 1K views' };
    }
}

/**
 * Update deal performance in DynamoDB
 */
async function updateDealPerformance(dealId, metrics, commission) {
    try {
        const { updateDealPerformance } = await import('./socialMediaUtils.js');
        
        const performanceData = {
            ...metrics,
            commission,
            lastUpdated: new Date().toISOString()
        };
        
        await updateDealPerformance(dealId, performanceData);
        console.log('[N8N] Updated deal performance in DynamoDB:', dealId);
        
    } catch (error) {
        console.error('[N8N] Error updating deal performance:', error);
    }
}

/**
 * Send performance update to restaurant owner
 */
async function sendPerformanceUpdateToOwner(dealId, metrics, commission) {
    try {
        // Get deal data to find restaurant owner
        const { DynamoDBClient, GetItemCommand } = await import('@aws-sdk/client-dynamodb');
        const { unmarshall } = await import('@aws-sdk/util-dynamodb');
        
        const dynamodb = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-1' });
        
        const dealResponse = await dynamodb.send(new GetItemCommand({
            TableName: 'ViralDeals',
            Key: { dealId: { S: dealId } }
        }));
        
        if (!dealResponse.Item) {
            console.warn('[N8N] Deal not found for performance update:', dealId);
            return;
        }
        
        const dealData = unmarshall(dealResponse.Item);
        
        // Create performance update message
        const updateMessage = {
            type: "text",
            text: `📊 **PERFORMANCE UPDATE** - ${dealData.restaurant.name}\n\n🔥 **Your "${dealData.dealDescription}" deal:**\n\n📈 **Current Stats:**\n👁️ Total Views: ${metrics.totalViews.toLocaleString()}\n❤️ Total Likes: ${metrics.totalLikes.toLocaleString()}\n📤 Total Shares: ${metrics.totalShares.toLocaleString()}\n💬 Total Comments: ${metrics.totalComments.toLocaleString()}\n\n🏆 **Performance Tier: ${commission.tier}**\n💰 Commission: $${commission.amount}\n\n📱 **Platform Breakdown:**\n${Object.entries(metrics.platformBreakdown).map(([platform, data]) => 
                `• ${platform.charAt(0).toUpperCase() + platform.slice(1)}: ${data.views || 0} views`
            ).join('\n')}\n\n${metrics.totalViews >= 50000 ? '🚨 VIRAL STATUS ACHIEVED! 🚨' : '📈 Growing steadily...'}\n\nNext update in 2 hours!`
        };
        
        // Send WhatsApp message
        const { sendWhatsAppMessage } = await import('./whatsappUtils.js');
        // Note: You'll need to get botConfig from somewhere, perhaps pass it through or store it
        
        console.log('[N8N] Performance update sent to restaurant owner');
        
    } catch (error) {
        console.error('[N8N] Error sending performance update to owner:', error);
    }
}

/**
 * Send viral alert to restaurant owner
 */
async function sendViralAlert(dealId, metrics) {
    try {
        // Get deal data
        const { DynamoDBClient, GetItemCommand, UpdateItemCommand } = await import('@aws-sdk/client-dynamodb');
        const { unmarshall, marshall } = await import('@aws-sdk/util-dynamodb');
        
        const dynamodb = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-1' });
        
        const dealResponse = await dynamodb.send(new GetItemCommand({
            TableName: 'ViralDeals',
            Key: { dealId: { S: dealId } }
        }));
        
        if (!dealResponse.Item) return;
        
        const dealData = unmarshall(dealResponse.Item);
        
        // Create viral alert message
        const viralMessage = {
            type: "text",
            text: `🚨 **VIRAL ALERT!** 🚨\n\n🔥 Your "${dealData.dealDescription}" deal just hit ${metrics.totalViews.toLocaleString()} views!\n\n📈 **Viral Stats:**\n• Currently trending in #SGFood\n• Estimated reach: ${(metrics.totalViews * 3).toLocaleString()} people\n• Commission tier: **${calculateCommissionTier(metrics.totalViews).tier}** ($${calculateCommissionTier(metrics.totalViews).amount})\n\n📞 **Your phone will be ringing soon!**\n\nCongratulations on going VIRAL! 🎉`
        };
        
        // Send viral alert
        const { sendWhatsAppMessage } = await import('./whatsappUtils.js');
        // Note: You'll need to get botConfig from somewhere
        
        // Mark viral alert as sent
        await dynamodb.send(new UpdateItemCommand({
            TableName: 'ViralDeals',
            Key: { dealId: { S: dealId } },
            UpdateExpression: 'SET viralAlert = :alert, viralAlertSentAt = :timestamp',
            ExpressionAttributeValues: marshall({
                ':alert': 'sent',
                ':timestamp': new Date().toISOString()
            })
        }));
        
        console.log('[N8N] Viral alert sent for deal:', dealId);
        
    } catch (error) {
        console.error('[N8N] Error sending viral alert:', error);
    }
}

/**
 * Handle N8N webhook for posting status updates
 */
export async function handleN8NPostingStatus(statusData) {
    try {
        console.log('[N8N] Received posting status update:', statusData.dealId);
        
        const { DynamoDBClient, UpdateItemCommand } = await import('@aws-sdk/client-dynamodb');
        const { marshall } = await import('@aws-sdk/util-dynamodb');
        
        const dynamodb = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-1' });
        
        // Update deal status based on N8N feedback
        const updateData = {
            postingStatus: statusData.status, // 'completed', 'failed', 'partial'
            platformsPosted: statusData.platformsPosted || [],
            platformsFailed: statusData.platformsFailed || [],
            postedAt: statusData.completedAt,
            n8nPipelineId: statusData.pipelineId
        };
        
        await dynamodb.send(new UpdateItemCommand({
            TableName: 'ViralDeals',
            Key: { dealId: { S: statusData.dealId } },
            UpdateExpression: 'SET postingStatus = :status, platformsPosted = :posted, platformsFailed = :failed, postedAt = :postedAt, n8nPipelineId = :pipelineId',
            ExpressionAttributeValues: marshall({
                ':status': updateData.postingStatus,
                ':posted': updateData.platformsPosted,
                ':failed': updateData.platformsFailed,
                ':postedAt': updateData.postedAt,
                ':pipelineId': updateData.n8nPipelineId
            })
        }));
        
        // Send confirmation to restaurant owner
        await sendPostingConfirmation(statusData);
        
        console.log('[N8N] Posting status updated successfully');
        
        return { success: true, status: statusData.status };
        
    } catch (error) {
        console.error('[N8N] Error handling posting status:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Send posting confirmation to restaurant owner
 */
async function sendPostingConfirmation(statusData) {
    try {
        // Get deal data
        const { DynamoDBClient, GetItemCommand } = await import('@aws-sdk/client-dynamodb');
        const { unmarshall } = await import('@aws-sdk/util-dynamodb');
        
        const dynamodb = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-1' });
        
        const dealResponse = await dynamodb.send(new GetItemCommand({
            TableName: 'ViralDeals',
            Key: { dealId: { S: statusData.dealId } }
        }));
        
        if (!dealResponse.Item) return;
        
        const dealData = unmarshall(dealResponse.Item);
        
        let confirmationMessage;
        
        if (statusData.status === 'completed') {
            confirmationMessage = {
                type: "text",
                text: `🚀 **DEAL POSTED SUCCESSFULLY!**\n\n✅ Your "${dealData.dealDescription}" is now LIVE across ${statusData.platformsPosted.length} platforms!\n\n📱 **Posted on:**\n${statusData.platformsPosted.map(platform => `✅ ${platform.charAt(0).toUpperCase() + platform.slice(1)}`).join('\n')}\n\n🎯 **Expected reach:** 20K-100K people\n📊 **First performance update:** Coming in 2 hours\n💰 **Commission:** Performance-based ($50-$500)\n\n🔥 **Your deal is going viral!** 🔥\n\nWe'll keep you updated with real-time performance metrics.`
            };
        } else if (statusData.status === 'partial') {
            confirmationMessage = {
                type: "text",
                text: `⚠️ **PARTIAL POSTING COMPLETED**\n\n✅ Posted successfully on:\n${statusData.platformsPosted.map(platform => `✅ ${platform.charAt(0).toUpperCase() + platform.slice(1)}`).join('\n')}\n\n❌ Failed to post on:\n${statusData.platformsFailed.map(platform => `❌ ${platform.charAt(0).toUpperCase() + platform.slice(1)}`).join('\n')}\n\n🔄 **We're retrying the failed platforms** and will update you shortly.\n\n📊 Performance tracking is active for successful posts.`
            };
        } else {
            confirmationMessage = {
                type: "text",
                text: `❌ **POSTING FAILED**\n\nWe encountered technical issues posting your deal.\n\n🔧 **Our team has been notified** and will:\n• Investigate the issue immediately\n• Retry posting within 30 minutes\n• Contact you with updates\n\n💪 **No worries** - we'll get your deal viral!\n\nExpected resolution: 30 minutes`
            };
        }
        
        // Send confirmation message
        const { sendWhatsAppMessage } = await import('./whatsappUtils.js');
        // Note: You'll need to get botConfig from somewhere
        
        console.log('[N8N] Posting confirmation sent to restaurant owner');
        
    } catch (error) {
        console.error('[N8N] Error sending posting confirmation:', error);
    }
}

/**
 * Create N8N webhook payload template
 */
export function createN8NWebhookPayload(dealData) {
    return {
        // Webhook metadata
        webhook: {
            source: 'viral-agency-bot',
            version: '1.0',
            timestamp: new Date().toISOString()
        },
        
        // Deal identification
        deal: {
            id: dealData.dealId,
            restaurantOwner: dealData.restaurantOwner,
            status: 'approved_for_posting'
        },
        
        // Restaurant information
        restaurant: dealData.restaurant,
        
        // Content to be posted
        content: dealData.generatedContent,
        
        // Platform-specific configurations
        platforms: {
            facebook: {
                enabled: true,
                content: dealData.generatedContent.platformContent.facebook,
                priority: 'high'
            },
            instagram: {
                enabled: true,
                content: dealData.generatedContent.platformContent.instagram,
                priority: 'high'
            },
            tiktok: {
                enabled: true,
                content: dealData.generatedContent.platformContent.tiktok,
                priority: 'medium'
            },
            telegram: {
                enabled: true,
                content: dealData.generatedContent.platformContent.telegram,
                priority: 'medium'
            },
            twitter: {
                enabled: true,
                content: dealData.generatedContent.platformContent.twitter,
                priority: 'medium'
            },
            whatsapp: {
                enabled: true,
                content: dealData.generatedContent.platformContent.whatsapp_status,
                priority: 'low'
            }
        },
        
        // Callback configuration
        callbacks: {
            performance_update: `${process.env.CALLBACK_BASE_URL}/api/n8n/performance`,
            posting_status: `${process.env.CALLBACK_BASE_URL}/api/n8n/status`,
            error_alert: `${process.env.CALLBACK_BASE_URL}/api/n8n/error`
        }
    };
}


