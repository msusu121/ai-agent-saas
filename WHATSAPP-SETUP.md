# WhatsApp Business Cloud API Setup Guide

## Part 1: Set up Meta Business Console & WhatsApp API

### Step 1: Create a Meta Developer Account
1. Go to [developers.facebook.com](https://developers.facebook.com/)
2. Log in with your Meta/Facebook account
3. Create a new app → Select **Business** → Choose **Manage Business Integrations**
4. Note your **App ID** and **App Secret**

### Step 2: Add WhatsApp Product
1. In your Meta Developer App Dashboard, go to **Add Product**
2. Search for **WhatsApp** and click **Set up**
3. Follow the WhatsApp Business Setup wizard
4. Choose **Develop** (test mode) or **Live** (production)

### Step 3: Get Access Token
1. Go to **WhatsApp > Settings > Permanent Token** (or **Temporary Token** for testing)
2. Copy the **System User Access Token**
3. This token is what goes into your `accessToken` credential field

### Step 4: Get Phone Number ID
1. Go to **WhatsApp > Settings > Phone numbers**
2. Add a phone number (you need a verified phone number)
3. Note the **Phone Number ID** from the settings page
4. Also note your **Business Account ID** from the top navigation

### Step 5: Create a Message Template

This is the critical step. Meta requires all non-template messages to be rejected. You MUST create and get approved a template before sending.

1. Go to **WhatsApp > Settings > Message templates**
2. Click **Create template**
3. Fill in:
   - **Template name**: `sales_agent_outreach` (use this exact name in your credential config)
   - **Category**: `MARKETING` or `UTILITY` (choose based on your use case)
   - **Language**: English
   - **Components**: Add body components with parameters

Example template structure:
```
Template Name: sales_agent_outreach
Category: MARKETING
Language: en_US

Body:
"Hello {{1}}, we noticed {{2}} and thought you might be interested in {{3}}."

Buttons (optional):
- CTA button: "Reply" or "Visit Website"
```

**Template parameters (3 max):**
- Parameter 1: Lead name or business name
- Parameter 2: Industry or key signal
- Parameter 3: Offer or recommended product

4. **Save** and **Request Approval**
5. Meta reviews templates (can take 1-24 hours for approval)
6. Once approved, the template name becomes available for your account

### Step 6: Sync Template
1. After approval, go to **Message templates** in WhatsApp settings
2. The template should show as **Approved** with a green checkmark
3. The template name `sales_agent_outreach` is now ready to use

---

## Part 2: Configure in the Application

### Step 7: Create WhatsApp Provider Credential

In your application's **Provider Credentials** section, create a new credential:

```json
{
  "provider": "WHATSAPP",
  "isActive": true,
  "organizationId": "<your-org-id>",
  "name": "WhatsApp Business API",
  "configuration": {
    "businessAccountId": "<your-business-account-id>",
    "phoneNumberId": "<your-phone-number-id>",
    "apiVersion": "v21.0",
    "accessToken": "<encrypted-system-user-access-token>",
    "templateName": "sales_agent_outreach",
    "templateLanguage": "en"
  }
}
```

**Important:** The `accessToken` is encrypted using the application's credential encryption system. Use the application's credential creation form to store it securely — the system handles encryption automatically.

### Step 8: Verify Connection
1. Go to your application's **Health check** or **Provider test** endpoint
2. The system should validate the template exists and is approved
3. If validation passes, the credential is ready to use

---

## Part 3: How It Works in Code

### Message Flow
```
Autopilot Worker → creates outreach message → Outreach Queue → Outreach Worker → deliverOutreach() → sendWhatsApp()
```

### Template Parameter Mapping
The `sendWhatsApp` function splits the message body into 3 parts using `splitBodyForTemplate()`:
- Body with `{param1}`, `{param2}`, `{param3}` placeholders → splits around them
- Body without placeholders → splits evenly into 3 chunks
- Each chunk becomes a template parameter

Example:
- Body: `"Hello {param1}, we found {param2}. Book now at {param3}"`
- Template params: `["Hello Lead Name", "we found High Value deal", "Book now at website"]`

### Meta Graph API Call
```
POST https://graph.facebook.com/v21.0/{phone-number-id}/messages

Body:
{
  "messaging_product": "whatsapp",
  "to": "<recipient-phone-number>",
  "type": "template",
  "template": {
    "name": "sales_agent_outreach",
    "language": { "code": "en" },
    "components": [
      {
        "type": "body",
        "parameters": [
          { "text": "param1 value" },
          { "text": "param2 value" },
          { "text": "param3 value" }
        ]
      }
    ]
  }
}
```

### Rate Limits
- **20 messages per second** per phone number
- **1000 messages per day** for new WhatsApp Business accounts
- The `outreach.worker.ts` has its own daily limit from `autopilotConfig.dailyLimit`

---

## Part 4: Testing

### Test with cURL
```bash
curl -X POST "https://graph.facebook.com/v21.0/YOUR_PHONE_NUMBER_ID/messages" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "RECIPIENT_PHONE_NUMBER_WITH_COUNTRY_CODE",
    "type": "template",
    "template": {
      "name": "sales_agent_outreach",
      "language": { "code": "en" },
      "components": [
        {
          "type": "body",
          "parameters": [
            { "text": "Test Business" },
            { "text": "AI Sales" },
            { "text": "Demo Offer" }
          ]
        }
      ]
    }
  }'
```

Expected response:
```json
{
  "messaging_product": "whatsapp",
  "contacts": [{"wa_id": "recipient"}],
  "messages": [{"id": "wamid.xxx"}]
}
```

### Test in the App
1. Create a draft outreach message with channel `WHATSAPP`
2. Approve it (status → `SCHEDULED`)
3. The outreach queue will deliver it via `outreach.worker.ts`
4. Check PM2 logs for delivery status

---

## Part 5: Common Issues

| Error | Cause | Fix |
|-------|-------|-----|
| `WHATSAPP_TEMPLATE_NOT_APPROVED` | Template not synced/approved | Wait for Meta approval or verify template name matches exactly |
| `WHATSAPP_PROVIDER_REQUIRED` | No active WhatsApp credential | Create a credential with `provider: 'WHATSAPP'` |
| `CHANNEL_PROVIDER_ERROR` | Invalid token/phone number | Verify access token and phone number ID |
| Template rejected | Contains prohibited content | Review Meta's policy, avoid promotional language in template |
| Message not delivered | Recipient opted out | Check recipient's previous interactions in Meta Dashboard |

---

## Files Changed

| File | Change |
|------|--------|
| `server/src/modules/autopilot/channel-delivery.service.ts` | `sendWhatsApp()` now calls Meta Graph API |
| `server/src/modules/autopilot/channel-delivery.service.ts` | Added `splitBodyForTemplate()` helper |
| `server/src/modules/autopilot/channel-delivery.service.ts` | Updated `whatsappConfiguration` schema with `accessToken`, `templateName`, `templateLanguage` |
