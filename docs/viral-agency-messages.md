## Viral Daily Deal Agency – Message Catalog and Flow

This document captures the end-to-end user flow, the exact WhatsApp messages we send, what is OpenAI-generated vs static, and where data is stored.

---

## End-to-end flows

### New restaurant owner
- Send any text (e.g., "hello").
- Receive Welcome interactive (Viral Agency overview).
- Provide restaurant name → we look it up via Google Places → confirm via interactive.
- Optionally provide social accounts or skip.
- Receive Setup Complete interactive with "📢 Submit Deal".
- Send today’s deal text (and optional photo).
- AI generates captions/hashtags and poster; poster uploaded to S3.
- Receive ONE Instagram approval interactive (header image = poster).
- Approve to publish (IG triggers auto-publish to other platforms in our flow).

### Existing restaurant owner
- Send casual "hello" → receive simple interactive with "📢 Submit Deal".
- Send deal text → AI generates content, poster to S3.
- Receive ONE Instagram approval interactive (header image = poster).
- Approve to publish.

### Reminders
- If enabled, we send a personalized daily reminder interactive within the 20–24h window since last owner message.

---

## Message catalog (exact payloads)

### 1) Welcome (interactive)
```json
{
  "type": "interactive",
  "interactive": {
    "type": "button",
    "header": { "type": "text", "text": "🔥 DAILY DEAL VIRAL AGENCY" },
    "body": {
      "text": "**Welcome to Singapore's #1 Daily Deal Marketing Agency!** 🇸🇬\n\n🎯 **What We Do Daily:**\n✅ Turn your daily specials into viral social media content\n✅ Post across 8+ platforms simultaneously\n✅ Generate stunning AI posters & captions\n✅ Track performance & customer engagement\n\n📱 **Our Platform Network:**\n🔥 Facebook • Instagram • TikTok • Telegram\n🔥 WhatsApp • Twitter • YouTube • Xiaohongshu\n\n💰 **Daily Revenue Boost:**\n📊 Average 150% daily sales increase\n🚀 Viral reach: 10K-50K per post\n💵 Commission-based: Pay only for results!\n\n**Ready to make your daily specials go VIRAL across Singapore?**"
    },
    "footer": { "text": "Start your viral journey today!" },
    "action": {
      "buttons": [
        { "type": "reply", "reply": { "id": "start_restaurant_setup", "title": "🚀 Setup Restaurant" } },
        { "type": "reply", "reply": { "id": "submit_todays_deal",  "title": "📢 Submit Deal" } }
      ]
    }
  }
}
```

### 2) Casual hello → Submit Deal (interactive)
```json
{
  "type": "interactive",
  "interactive": {
    "type": "button",
    "header": { "type": "text", "text": "👋 Hello Hawker Chan!" },
    "body": { "text": "Great to hear from you! 🍽️\n\n**Ready to submit today's special deal?**\n\nJust send us your deal details and we'll create viral content for all your social media platforms instantly!\n\n📱 *Example:* \"Fresh salmon teriyaki bowl $16 today only!\"" },
    "footer": { "text": "Let's make your deal go viral!" },
    "action": {
      "buttons": [
        { "type": "reply", "reply": { "id": "submit_todays_deal", "title": "📢 Submit Deal" } }
      ]
    }
  }
}
```

### 3) Submit today’s deal (text prompt)
```json
{
  "type": "text",
  "text": "📢 **TODAY'S SPECIAL DEAL** 🔥\n\n**Please provide your daily special details:**\n\n📝 **Include:**\n• 🍜 Dish name & description\n• 💰 Original price → Special price\n• ⏰ Valid timing (e.g., lunch only, all day)\n• 🎯 Special offer details\n• 📸 Photo of the dish (optional)\n\n💡 **Pro Tips for Maximum Viral Impact:**\n• Mention limited quantity (\"Only 50 portions!\")\n• Add urgency (\"Today only!\", \"Until 6pm!\")\n• Highlight what makes it special\n• Include any story behind the dish\n\n**Example:**\n*\"Today's Special: Signature Laksa - Usually $12, now only $8! Made with our secret 20-ingredient spice paste. Only 30 bowls available until 3pm!\"*\n\n**Type your today's deal details:**"
}
```

### 4) Instagram approval (interactive with image header)
- Header image: S3 poster URL if available; otherwise enhanced photo; else text header.
```json
{
  "type": "interactive",
  "interactive": {
    "type": "button",
    "header": { "type": "image", "image": { "link": "https://viral-agency-content.s3.ap-southeast-1.amazonaws.com/deals/deal_1234/poster.jpg" } },
    "body": { "text": "📱 **INSTAGRAM CONTENT READY**\n\n🍽️ **Deal:** 30 dollars off for 60 dollars chicken dinner...\n💰 **Price:** Usually $60, now $30\n⏰ **Valid:** Today only\n\n📝 **Caption:**\n🔥 Limited-time chicken dinner...\n\n🏷️ **Tags:** #SingaporeFood #SGDeals #Yum" },
    "footer": { "text": "🚀 Launch viral campaign" },
    "action": {
      "buttons": [
        { "type": "reply", "reply": { "id": "approve_instagram", "title": "🚀 LAUNCH!" } }
      ]
    }
  }
}
```

### 5) Setup Complete (interactive)
```json
{
  "type": "interactive",
  "interactive": {
    "type": "button",
    "header": { "type": "text", "text": "🎉 SETUP COMPLETE!" },
    "body": { "text": "**Your restaurant is now registered!** ✅\n\n🔥 **You're ready to start posting viral daily deals!**\n\n📅 **Daily Workflow:**\n1️⃣ Submit your daily special (text/photo)\n2️⃣ AI generates viral content for all platforms\n3️⃣ You approve the content\n4️⃣ We post across 8+ social media platforms\n5️⃣ Track performance & customer engagement\n\n⏰ **Daily Reminders:**\nWe'll remind you every morning to submit your daily special!\n\n**Ready to submit your first viral deal?**" },
    "footer": { "text": "Let's make your food go viral!" },
    "action": {
      "buttons": [
        { "type": "reply", "reply": { "id": "submit_todays_deal", "title": "📢 Submit Deal" } },
        { "type": "reply", "reply": { "id": "enable_reminders",   "title": "🔔 Enable Daily Reminders" } }
      ]
    }
  }
}
```

### 6) Social media details (interactive)
```json
{
  "type": "interactive",
  "interactive": {
    "type": "button",
    "header": { "type": "text", "text": "📱 SOCIAL MEDIA SETUP" },
    "body": { "text": "**STEP 2: Social Media Details** 📱\n\n**Please provide your social media accounts:**\n\n📝 **Format (one per line):**\n• Facebook: @your-page-name\n• Instagram: @your-handle\n• TikTok: @your-handle\n• Website: your-website.com\n• Google My Business: Yes/No\n\n📈 **Why We Need This:**\n✅ Tag your accounts in viral posts\n✅ Drive followers to your pages\n✅ Cross-platform promotion\n✅ Track engagement properly\n\n**Type your social media details, or skip for now:**" },
    "footer": { "text": "We'll maximize your online presence" },
    "action": {
      "buttons": [
        { "type": "reply", "reply": { "id": "skip_social_media", "title": "⏭️ Skip For Now" } }
      ]
    }
  }
}
```

### 7) Publishing success (interactive)
```json
{
  "type": "interactive",
  "interactive": {
    "type": "button",
    "header": { "type": "text", "text": "🚀 CONTENT PUBLISHED!" },
    "body": { "text": "**SUCCESS! Your deal is now LIVE across all platforms!** 🎉\n\n📊 **Published On:**\n✅ Facebook\n✅ Instagram\n✅ TikTok\n✅ Telegram\n✅ Twitter\n\n🔥 **Expected Results:**\n📈 Reach: 10K-50K people\n👥 Engagement: 500-2K interactions\n🏃‍♂️ Foot Traffic: +150% today\n\n📱 **Deal ID:** deal_...\n\n**We'll track performance and send you updates!**" },
    "footer": { "text": "Your viral marketing is active!" },
    "action": {
      "buttons": [
        { "type": "reply", "reply": { "id": "view_performance",   "title": "📊 Track Performance" } },
        { "type": "reply", "reply": { "id": "submit_todays_deal", "title": "📢 New Deal Tomorrow" } },
        { "type": "reply", "reply": { "id": "enable_reminders",   "title": "🔔 Daily Reminders" } }
      ]
    }
  }
}
```

### 8) Daily reminder (interactive)
```json
{
  "type": "interactive",
  "interactive": {
    "type": "button",
    "header": { "type": "text", "text": "🔔 Daily Reminder" },
    "body": { "text": "🍽️ Hi {RestaurantName}! Ready to share today's special? 🚀\n\nSubmit your deal and we'll create viral content for all platforms! 📱✨" },
    "footer": { "text": "Submit your daily deal now!" },
    "action": {
      "buttons": [
        { "type": "reply", "reply": { "id": "submit_deal",       "title": "🍽️ Submit Deal" } },
        { "type": "reply", "reply": { "id": "check_status",     "title": "📊 Check Status" } },
        { "type": "reply", "reply": { "id": "disable_reminders", "title": "🔕 Disable" } }
      ]
    }
  }
}
```

---

## Static vs OpenAI-generated

**Static templates**
- Welcome, Casual Hello, Submit Deal Prompt, Social Media Setup, Setup Complete, Instagram Approval Interactive, Publishing Success, Help/Errors, Reminders Enabled/Disabled.

**OpenAI-generated**
- Deal detection (YES/NO classifier).
- Viral captions and platform content text.
- Personalized daily reminder body text.

**Poster generation**
- Poster is generated and uploaded to S3; Instagram approval uses the poster URL as header image when available.

---

## Data storage (DynamoDB)

Tables used (by code and IAM permissions):
- `RestaurantProfiles`
  - Keys/fields used: `userId`, `restaurantName`, `location`, `socialMedia`, `registeredAt`, `reminderEnabled`, `lastMessageTime`, `lastReminderTime`, `storeId`, `lastUpdated`.
- `DailyDeals`
  - Stored on publish: `dealId`, `restaurantName`, `userId`, `dealDetails`, `generatedContent`, `publishedAt`, `status`, `platforms`.
- `WhatsappStoreTokens` (per-store config, tokens, secrets, phone number ID, etc.).
- Session tables: `${service}-${stage}-sessions`, `${service}-${stage}-enhanced-sessions`.
- Optional/auxiliary: `ViralDiscoveries`, `HashtagMonitoring`, `ViralReports`.

S3 bucket
- `viral-agency-content` (poster uploads under `deals/{dealId}/poster.jpg`).

---

## WhatsApp constraints
- Button title length ≤ 20 characters (we use "📢 Submit Deal").
- Interactive message body should stay under Meta’s limits (we truncate where needed).






