// DynamoDB Schema and Setup for Viral Deals System

/**
 * DynamoDB Table Schema for ViralDeals
 */
export const ViralDealsSchema = {
    TableName: 'ViralDeals',
    KeySchema: [
        {
            AttributeName: 'dealId',
            KeyType: 'HASH' // Partition key
        }
    ],
    AttributeDefinitions: [
        {
            AttributeName: 'dealId',
            AttributeType: 'S'
        },
        {
            AttributeName: 'restaurantOwner',
            AttributeType: 'S'
        },
        {
            AttributeName: 'createdAt',
            AttributeType: 'S'
        },
        {
            AttributeName: 'status',
            AttributeType: 'S'
        }
    ],
    GlobalSecondaryIndexes: [
        {
            IndexName: 'RestaurantOwnerIndex',
            KeySchema: [
                {
                    AttributeName: 'restaurantOwner',
                    KeyType: 'HASH'
                },
                {
                    AttributeName: 'createdAt',
                    KeyType: 'RANGE'
                }
            ],
            Projection: {
                ProjectionType: 'ALL'
            },
            BillingMode: 'PAY_PER_REQUEST'
        },
        {
            IndexName: 'StatusIndex',
            KeySchema: [
                {
                    AttributeName: 'status',
                    KeyType: 'HASH'
                },
                {
                    AttributeName: 'createdAt',
                    KeyType: 'RANGE'
                }
            ],
            Projection: {
                ProjectionType: 'ALL'
            },
            BillingMode: 'PAY_PER_REQUEST'
        }
    ],
    BillingMode: 'PAY_PER_REQUEST',
    StreamSpecification: {
        StreamEnabled: true,
        StreamViewType: 'NEW_AND_OLD_IMAGES'
    }
};

/**
 * Sample deal item structure
 */
export const SampleViralDeal = {
    dealId: 'deal_1640995200000_1234',
    restaurantOwner: '+6591234567',
    restaurant: {
        name: 'Mario\'s Italian Restaurant',
        address: '123 Orchard Road, Singapore 238857',
        placeId: 'ChIJAbCDeFgHiJkLmN0pQrStUvWx',
        rating: 4.5,
        phone: '+6562345678',
        website: 'https://marios.sg',
        photos: ['photo_reference_1', 'photo_reference_2']
    },
    dealDescription: '20% off all pasta dishes',
    pricing: 'Pasta usually $25 → Now $20',
    validity: 'Valid until Friday 31st Dec 2024',
    targetAudience: 'Students, young professionals, couples',
    contactMethod: 'Call +6562345678 or WhatsApp +6591234567',
    specialNotes: 'Dine-in only, cannot combine with other offers',
    photoUrl: 'https://example.com/pasta-deal.jpg',
    status: 'PROCESSING', // PROCESSING, POSTED, VIRAL, COMPLETED, FAILED
    createdAt: '2024-01-01T12:00:00.000Z',
    updatedAt: '2024-01-01T12:00:00.000Z',
    
    // AI-generated content
    viralContent: {
        captions: [
            '🔥 LOBANG ALERT! 20% off all pasta at Mario\'s! Limited time only! 🍝 #SGFood #SGDeals #OrchardFood',
            '😱 Pasta lovers, this one\'s for YOU! 20% savings at Mario\'s Orchard! Don\'t walk, RUN! 🏃‍♂️ #LobangAlert',
            'FINALLY! The pasta deal we\'ve all been waiting for! Mario\'s Orchard 20% off! 🤤 #ViralEats #SGFood'
        ],
        selectedCaption: '🔥 LOBANG ALERT! 20% off all pasta at Mario\'s! Limited time only! 🍝 #SGFood #SGDeals #OrchardFood',
        hashtags: ['#SGFood', '#SGDeals', '#OrchardFood', '#LobangAlert', '#ViralEats', '#Italian', '#Pasta'],
        viralScore: 7.5,
        optimalPostingTimes: {
            immediate: true,
            evening: false,
            weekend: false,
            suggestions: {
                facebook: ['12:00', '15:00', '19:00'],
                instagram: ['11:30', '14:00', '18:30'],
                tiktok: ['18:00', '20:00', '22:00']
            }
        }
    },
    
    // Platform-specific content
    platformContent: {
        facebook: {
            text: '🔥 LOBANG ALERT! 20% off all pasta at Mario\'s! Limited time only! 🍝\n\n📍 Mario\'s Italian Restaurant\n💰 Pasta usually $25 → Now $20\n📅 Valid until Friday 31st Dec 2024\n📞 Call +6562345678\n\n#SGFood #SGDeals #OrchardFood #LobangAlert',
            image: 'https://example.com/pasta-deal.jpg',
            postId: '1234567890123456',
            status: 'POSTED'
        },
        instagram: {
            caption: '🔥 LOBANG ALERT! 20% off all pasta at Mario\'s! Limited time only! 🍝\n\n#SGFood #SGDeals #OrchardFood #LobangAlert #ViralEats #Italian #Pasta',
            image: 'https://example.com/pasta-deal.jpg',
            postId: 'ABC123DEF456',
            status: 'POSTED'
        },
        telegram: {
            text: '🚨 DEAL ALERT 🚨\n\n🏪 Mario\'s Italian Restaurant\n💰 20% off all pasta dishes\n📊 Pasta usually $25 → Now $20\n📅 Valid until Friday 31st Dec 2024\n📞 Call +6562345678\n\n📍 Location: 123 Orchard Road, Singapore 238857\n\n⚡ Book now before it\'s gone!',
            messageId: 789,
            status: 'POSTED'
        }
    },
    
    // Performance metrics
    performanceMetrics: {
        totalViews: 25430,
        totalLikes: 1247,
        totalShares: 234,
        totalComments: 89,
        lastUpdated: '2024-01-01T14:00:00.000Z',
        platformBreakdown: {
            facebook: {
                views: 12000,
                likes: 600,
                shares: 120,
                comments: 45,
                postId: '1234567890123456'
            },
            instagram: {
                views: 8500,
                likes: 420,
                shares: 85,
                comments: 32,
                postId: 'ABC123DEF456'
            },
            telegram: {
                views: 3200,
                likes: 0, // Telegram channels don't have likes
                shares: 15,
                comments: 8,
                messageId: 789
            },
            twitter: {
                views: 1730,
                likes: 227,
                shares: 14,
                comments: 4,
                postId: 'tweet123'
            }
        },
        hourlyTracking: [
            {
                timestamp: '2024-01-01T12:00:00.000Z',
                totalViews: 1250,
                totalEngagement: 89
            },
            {
                timestamp: '2024-01-01T14:00:00.000Z',
                totalViews: 5680,
                totalEngagement: 342
            },
            {
                timestamp: '2024-01-01T16:00:00.000Z',
                totalViews: 12340,
                totalEngagement: 756
            }
        ]
    },
    
    // Commission and billing
    commission: {
        tier: 'Silver', // Bronze, Silver, Gold, Viral
        amount: 150,
        status: 'PENDING', // PENDING, INVOICED, PAID
        invoiceId: null,
        paidAt: null
    },
    
    // Agency tracking
    agencyData: {
        processedBy: 'viral-content-creator-v1',
        processedAt: '2024-01-01T12:05:00.000Z',
        postedBy: 'social-poster-v1',
        postedAt: '2024-01-01T12:10:00.000Z',
        lastPerformanceUpdate: '2024-01-01T14:00:00.000Z',
        nextUpdateDue: '2024-01-01T16:00:00.000Z'
    }
};

/**
 * DynamoDB Table Schema for Social Media Config
 */
export const SocialMediaConfigSchema = {
    TableName: 'SocialMediaConfig',
    KeySchema: [
        {
            AttributeName: 'configId',
            KeyType: 'HASH'
        }
    ],
    AttributeDefinitions: [
        {
            AttributeName: 'configId',
            AttributeType: 'S'
        }
    ],
    BillingMode: 'PAY_PER_REQUEST'
};

/**
 * Sample social media configuration
 */
export const SampleSocialMediaConfig = {
    configId: 'agency_main_config',
    facebook: {
        pageId: 'your_facebook_page_id',
        accessToken: 'your_facebook_access_token',
        appId: 'your_facebook_app_id',
        appSecret: 'your_facebook_app_secret'
    },
    instagram: {
        accountId: 'your_instagram_business_account_id',
        accessToken: 'your_instagram_access_token'
    },
    telegram: {
        botToken: 'your_telegram_bot_token',
        channelId: '@your_telegram_channel',
        chatId: 'your_channel_chat_id'
    },
    twitter: {
        bearerToken: 'your_twitter_bearer_token',
        apiKey: 'your_twitter_api_key',
        apiSecret: 'your_twitter_api_secret',
        accessToken: 'your_twitter_access_token',
        accessTokenSecret: 'your_twitter_access_token_secret'
    },
    whatsapp: {
        phoneNumberId: 'your_whatsapp_phone_number_id',
        accessToken: 'your_whatsapp_access_token',
        appSecret: 'your_whatsapp_app_secret'
    },
    tiktok: {
        accessToken: 'your_tiktok_access_token',
        clientKey: 'your_tiktok_client_key',
        clientSecret: 'your_tiktok_client_secret'
    },
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z'
};

/**
 * Performance tracking events schema
 */
export const PerformanceEventSchema = {
    TableName: 'PerformanceEvents',
    KeySchema: [
        {
            AttributeName: 'dealId',
            KeyType: 'HASH'
        },
        {
            AttributeName: 'timestamp',
            KeyType: 'RANGE'
        }
    ],
    AttributeDefinitions: [
        {
            AttributeName: 'dealId',
            AttributeType: 'S'
        },
        {
            AttributeName: 'timestamp',
            AttributeType: 'S'
        }
    ],
    BillingMode: 'PAY_PER_REQUEST',
    TimeToLiveSpecification: {
        AttributeName: 'ttl',
        Enabled: true
    }
};

/**
 * Restaurant owner tracking schema
 */
export const RestaurantOwnerSchema = {
    TableName: 'RestaurantOwners',
    KeySchema: [
        {
            AttributeName: 'phoneNumber',
            KeyType: 'HASH'
        }
    ],
    AttributeDefinitions: [
        {
            AttributeName: 'phoneNumber',
            AttributeType: 'S'
        }
    ],
    BillingMode: 'PAY_PER_REQUEST'
};

/**
 * Sample restaurant owner profile
 */
export const SampleRestaurantOwner = {
    phoneNumber: '+6591234567',
    restaurants: [
        {
            name: 'Mario\'s Italian Restaurant',
            placeId: 'ChIJAbCDeFgHiJkLmN0pQrStUvWx',
            address: '123 Orchard Road, Singapore 238857',
            verified: true
        }
    ],
    totalDeals: 5,
    totalCommissionPaid: 750,
    averageViralScore: 7.2,
    preferredContactMethod: 'whatsapp',
    joinedAt: '2024-01-01T00:00:00.000Z',
    lastActive: '2024-01-01T12:00:00.000Z',
    tier: 'GOLD', // BRONZE, SILVER, GOLD, PLATINUM
    monthlyPackage: null,
    preferences: {
        postingTimes: ['12:00', '18:00'],
        platforms: ['facebook', 'instagram', 'telegram'],
        autoApprove: false,
        performanceUpdates: 'every_2_hours'
    }
};


