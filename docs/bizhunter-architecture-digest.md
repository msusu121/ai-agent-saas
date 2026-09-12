# BizHunter architecture digest

BizHunter - Complete Product Architecture & Lead Intelligence Blueprint v2.0
BizHunter
Complete Product Architecture & Lead Intelligence Blueprint
VERSION 2.0 - SOCIAL MEDIA MANAGEMENT & DEMAND GENERATION INTEGRATED
FROM PRODUCT IMAGE TO DEMAND, QUALIFIED CUSTOMER, SALE - AND A 
LEARNING LOOP THAT GETS BETTER
North-star promise: Give BizHunter a product. It understands who is likely to buy it, chooses the right acquisition 
strategy, creates and distributes content that can generate demand, finds evidence-backed opportunities, manages 
permitted engagement, communicates within approved guardrails, surfaces qualified customers, attributes outcomes 
and learns what works.

BizHunter - Complete Product Architecture & Lead Intelligence Blueprint v2.0
1. Product architecture principle
BizHunter should not be designed as a Google Places lead finder with extra AI, nor as a generic social scheduler. It 
should be an AI customer-acquisition and social demand operating system. Product understanding comes first; 
acquisition and demand-generation routes come second.
 Classify each product as B2B, B2C or HYBRID internally.
 Do not force consumers through business-directory discovery.
 Use the same Product Intelligence and Knowledge/Truth layers across hunting, content creation, community 
management and sales conversations.
 The seller should see plain-language goals, not technical jargon unless needed.
 The routing decision must control discovery providers, social content strategy, scoring, outreach, campaign 
strategy and conversion tracking.
 Always allow user override of AI recommendations.
2. Product Intelligence Layer
 Product/service name and description
 Product images and optional video
 Website/landing page
 Price/range
 Location/service area
 Stock/availability where relevant
 Existing customer description
 Approved claims/features
 Brand voice
 Desired next step/CTA
 Optional seller instructions
Structured output
product_category
business_model: B2B | B2C | HYBRID
confidence_score
ideal_customer_profiles[]
buyer_personas[]
industries[]
interests[]
intent_keywords[]
negative_keywords[]
locations[]
recommended_channels[]
recommended_strategy[]
recommended_goal
content_pillars[]
recommended_content_formats[]
risk_or_policy_flags[]
Example Route Buyer Primary engine
School attendance system B2B Schools / administrators Business + decision-maker 
intelligence
Football jersey B2C Football fans / shoppers Social demand + public intent + 
first-party + inbound + paid
Event venue HYBRID Individuals + organizations
Separate consumer and 
business strategies + social 
demand

BizHunter - Complete Product Architecture & Lead Intelligence Blueprint v2.0
3. Goal Engine - ask what outcome the seller wants
B2B/B2C/Hybrid is an internal routing concept. The customer-facing UX should start with the outcome.
Goal How BizHunter optimizes
Find businesses Company discovery, decision makers, need signals and outreach
Find consumers Public intent, first-party audiences, inbound and paid acquisition
Grow social presence Content strategy, publishing, community growth and engagement
Create demand Organic content + social listening + paid amplification
Get enquiries Optimize CTA toward WhatsApp/DM/form responses
Book meetings Qualify and drive calendar/demo booking
Generate sales Optimize toward checkout/order/human sales handoff
Re-engage old leads Use authorized first-party data and prior conversation context
Recommended UX: user uploads product -> BizHunter analyzes it -> recommends a goal and combined hunt/content 
strategy -> user approves/edits -> agent begins.
4. Separate Hunt & Demand Engines
4.1 B2B Hunt Engine
 Business/Places providers
 Company websites and public web research
 Industry directories
 Decision-maker/contact enrichment where permitted
 Technology/job/growth/location/business signals
 Fit + need + timing scoring
4.2 B2C Public Intent Engine
 Permitted public posts/comments/conversations
 Keyword and semantic intent search
 Location/product/price/urgency matching
 Freshness and purchase-intent classification
 Evidence/source URL preserved
 Only permitted engagement actions exposed
4.3 First-Party Audience Engine
 CRM and prior leads
 Website enquiries/forms
 Authorized email history
 Connected business messaging/social channels
 Prior comments/DMs where permitted
 Customer lists and past purchasers supplied by merchant
4.4 Inbound Engine
 WhatsApp/business messaging
 Website chat/forms
 Email
 Social replies/DMs where permitted
 Campaign responses
 Normalize every inbound response into one conversation pipeline

BizHunter - Complete Product Architecture & Lead Intelligence Blueprint v2.0
4.5 Paid Acquisition Engine
 Recommend audience and channel
 Generate approved creative/copy
 Campaign launch/assist through supported APIs
 Capture inbound responses
 Qualify and route conversions
4.6 Re-engagement Engine
 Old enquiries
 No-response prospects
 Quote sent but no close
 Repeat-purchase customers
 Follow-up-due opportunities
 Respect suppression and contact-frequency rules
4.7 Social Media Management & Demand Generation Engine
This is a first-class BizHunter engine, not a bolt-on scheduler. Its role is to create demand, capture engagement and 
convert commercially relevant social interactions into the same CustomerSignal, Opportunity, Conversation and 
Conversion infrastructure used by the hunt engines.
 Content strategy: build weekly/monthly plans from product, ICP/persona, objective, seasonality, location, offers 
and prior performance.
 Content creation: captions, posts, carousels, Reels/TikTok concepts, short-video scripts, educational posts, FAQs, 
testimonials, offers and promotional content.
 Asset intelligence: use uploaded product images/video and approved brand assets; recommend required assets 
when content cannot be produced credibly.
 Content calendar: Draft | Needs Approval | Scheduled | Published | Failed, with recommended publishing 
windows.
 Multi-platform publishing through SocialPublishingProvider adapters rather than hard-coded platform logic.
 Community management: ingest permitted comments, mentions and DMs; classify questions, purchase intent, 
complaints, spam and support needs.
 Knowledge-grounded replies: answer only from approved merchant/product knowledge; otherwise defer or hand 
off.
 Social listening: surface permitted category conversations, competitor signals, recurring questions, emerging 
demand and content opportunities.
 Intent-to-lead conversion: transform commercially relevant comments/DMs/mentions into CustomerSignals and 
Opportunities.
 Performance intelligence: connect reach and engagement to enquiries, qualified leads, customers, revenue and 
ROI.
 Content learning: learn which hooks, topics, formats, CTAs, posting times, offers and channels produce 
commercial outcomes.
Architectural rule: Social Media Manager creates and captures demand. Hunt Engines discover existing demand. 
Both feed the same Opportunity, Conversation, Conversion and Learning infrastructure.
5. Social Content Intelligence Layer
The social engine needs structured content intelligence so it can behave like a competent social media manager rather 
than a caption generator.
 Content pillars[] and percentage mix (education, proof, product, community, offer, entertainment, authority).

BizHunter - Complete Product Architecture & Lead Intelligence Blueprint v2.0
 Audience/persona -> platform -> format mapping.
 Brand voice, language preferences, prohibited phrases and claim restrictions.
 Campaign objective and CTA hierarchy.
 Platform-specific length, format and media requirements from connector capabilities.
 Creative brief: hook, angle, key message, proof, CTA, required asset.
 Content lifecycle and approval state.
 Content provenance: which product facts, offer, asset and AI instruction generated the post.
 Repurposing graph: one campaign idea can become platform-native variants without blindly cross-posting 
identical copy.
6. Social Engagement -> Revenue Pipeline
POST / AD / SOCIAL LISTENING
        -> ENGAGEMENT EVENT
        -> INTENT CLASSIFICATION
        -> CUSTOMER SIGNAL
        -> IDENTITY RESOLUTION
        -> OPPORTUNITY
        -> CONVERSATION
        -> QUALIFICATION / HUMAN HANDOFF
        -> SALE
        -> ATTRIBUTION
        -> CONTENT + HUNT LEARNING
 Engagement alone is not a lead. Create an Opportunity only when evidence passes configurable intent/fit 
thresholds.
 Preserve the source post/comment/DM and content/campaign ID for attribution.
 Do not auto-DM or market merely because somebody liked or followed; the Policy Engine decides allowed actions.
 Examples of high-value signals include explicit price, availability, delivery, booking, demo or purchase questions.
 Community/support interactions remain in the conversation layer even when they are not sales opportunities.
7. How to enrich BizHunter with information that actually 
produces leads
The app should become an information fusion engine. More data is not automatically better; the valuable data is 
evidence that improves fit, intent, timing, reachability and conversion probability.
Enrichment layer What to collect Why it improves leads
Product knowledge Features, use cases, price, stock, delivery, 
FAQs, proof, exclusions
Prevents generic targeting and hallucinated 
claims
Company intelligence Industry, size, branches, website, services, 
contacts, public changes Improves B2B fit and personalization
Need signals Jobs, expansion, branch openings, tech gaps, 
public requests
Adds timing: why the prospect may need it 
now
Public consumer intent Questions, requests, comparisons, 
price/location buying conversations Finds consumers showing actual interest
First-party behavior Enquiry, DM, email, form, quote, viewed 
product, purchase, last contact
Often higher commercial value than cold 
discovery
Social engagement Comments, DMs, mentions, saves/shares 
where available, post context
Connects content response to intent and 
conversation
Content performance
Topic, hook, format, CTA, posting time, 
platform, engagement, downstream 
conversion
Teaches what content creates commercial 
outcomes
Conversation intelligence Questions, objections, sentiment, budget, 
urgency, stage, next action Turns messages into structured sales signals
Merchant outcomes Won/lost, revenue, reason lost, meeting, Teaches what a good lead looks like

BizHunter - Complete Product Architecture & Lead Intelligence Blueprint v2.0
order, refund/cancel
Channel performance Replies, conversions, cost, response time, 
best hour/day Routes toward channels that work
Offer intelligence Price, discount, bundle, delivery promise, 
expiry, CTA Matches offer to opportunity
Geographic intelligence Service radius, zones, branches, local 
demand signals
Avoids wasted activity outside fulfillment 
areas
Priority rule: first-party + explicit intent + recent evidence should normally outrank weak demographic or generic-
interest assumptions.
8. Enrichment pipeline
 Step 1 - Ingest: product data, connected sources, social events and discovery-provider results.
 Step 2 - Normalize: convert provider-specific data into common entities/signals.
 Step 3 - Resolve identity: deduplicate companies/people across sources with confidence scoring.
 Step 4 - Extract evidence: product need, intent, timing, geography, role, content context, conversation and 
behavioral signals.
 Step 5 - Score: fit + intent + timing + freshness + reachability + evidence confidence.
 Step 6 - Policy check: determine allowed actions and consent/template requirements.
 Step 7 - Rank: surface highest-value opportunities with a human-readable explanation.
 Step 8 - Learn: feed content, conversation and commercial outcomes back into scoring and strategy.
9. Unified CustomerSignal and Opportunity model
CustomerSignal
tenantId / productId / campaignId / contentId
source / sourceType / sourceUrl
subjectType: BUSINESS | PERSON | UNKNOWN
externalSubjectId / displayName / publicProfileUrl
signalText / signalType / detectedAt / location
intentScore / fitScore / timingScore
freshnessScore / reachabilityScore / confidenceScore
overallScore
evidence[]
allowedActions[]
status
Opportunity
customerSignalIds[]
identityId / stage / owner
estimatedValue / nextAction / nextActionAt
conversationId / outcome / revenueAttributed
10. Identity Resolution & Deduplication
 The same customer may appear via website chat, Instagram, WhatsApp, email and other supported channels.
 Create an IdentityGraph or equivalent resolution service.
 Merge only when confidence/evidence supports it; preserve original source identities.
 Prevent duplicate outreach across campaigns/channels.
 Expose uncertain matches for review rather than silently merging.

BizHunter - Complete Product Architecture & Lead Intelligence Blueprint v2.0
11. Lead scoring - rank for likelihood, not just similarity
Dimension Example meaning Initial role
Fit Does this person/business match the ICP? High
Intent Are they actively showing a relevant 
need/buying signal? Very high
Timing Is there evidence the need exists now? High
Freshness How recent is the evidence? High for intent-led B2C
Reachability Is there a permitted/realistic channel to 
engage? High
Evidence confidence How reliable is the evidence? High
Prior relationship Existing enquiry/customer/lead? Context-dependent
Content interaction context Did a specific post/offer trigger commercial 
intent? Context-dependent
Predicted conversion Learned from seller-specific outcomes Increase as data grows
Every score must have a Why this lead? explanation with evidence. Do not expose false precision when evidence is 
weak.
12. Knowledge & Truth Layer
 Approved product facts and claims
 Current price and offers
 Stock/availability where connected
 Delivery/service locations
 Warranty/returns
 FAQs
 Case studies/testimonials approved for use
 Prohibited claims/topics
 Escalation rules
 Brand voice and language preferences
The reply and content agents should retrieve only approved merchant/product knowledge before making commercial 
claims. If an answer is unsupported, ask, defer or hand off - never invent pricing, availability, discounts or guarantees.
13. Outreach Instructions + Message Preview
 Seller defines introduction, key points, exclusions, CTA, tone, language and follow-up behavior.
 AI generates channel-specific personalized copy using lead evidence and approved product knowledge.
 Before sending: Edit | Regenerate | Approve & Start | Schedule.
 Autonomy modes: review every message; review first message; approved autonomy within guardrails.
 Store prompt/instructions version used for every message for auditability.
14. Content Approval + Publishing Workflow
 Before publishing: Edit | Regenerate | Approve | Schedule | Publish now.
 Autonomy modes: approve every post; approve campaign plan then allow scheduled variants; approved 
autonomy within brand/policy guardrails.
 Maintain content calendar views by product, campaign, platform and status.
 Support reschedule, pause campaign, cancel, duplicate/repurpose and retry failed publish.

BizHunter - Complete Product Architecture & Lead Intelligence Blueprint v2.0
 Never assume identical capabilities across social platforms; connector capability declarations control available 
actions.
15. Human Handoff
 Prospect requests quotation/custom pricing
 High-value order or negotiation
 Prospect asks for a call/demo
 Complaint/anger/risk signal
 Question outside approved knowledge
 Low AI confidence
 Sensitive contractual/payment discussion
 Seller-defined VIP threshold
 Public social issue with reputational risk
The handoff card should summarize: who, what they want, source/content that triggered the conversation, key 
conversation points, objections, estimated value, recommended next action and urgency.
16. Scheduling and Campaign Orchestration
 Agent: Active | Scheduled | Completed.
 Messages: Inbox | Needs Review | Scheduled | Sent.
 Content: Draft | Needs Approval | Scheduled | Published | Failed.
 Store audience, product, channels, content plan, next run, frequency, working hours, stop condition and 
campaign end date.
 Actions: Pause, Edit, Run now, Cancel.
 Campaign budgets: maximum prospects, messages/day, posts/week, spend/day, total spend and channel limits.
 Automatic stop conditions: goal reached, budget reached, excessive negative responses, source/API unavailable or 
policy failure.
17. Permission, Privacy & Suppression Engine
CAN_SEARCH_PUBLIC_CONTENT
CAN_READ_COMMENTS
CAN_REPLY_PUBLICLY
CAN_INITIATE_DM
CAN_MESSAGE_EXISTING_CONTACT
CAN_SEND_MARKETING_MESSAGE
CAN_PUBLISH_CONTENT
CAN_READ_MENTIONS
CAN_READ_DM
REQUIRES_TEMPLATE
REQUIRES_OPT_IN
 DO_NOT_CONTACT / STOP / unsubscribe
 Hard bounce/invalid contact
 Blocked user
 Seller exclusion list
 Recent-contact cooldown
 Campaign-level frequency cap
 Channel-specific consent status
 Legal/platform restriction

BizHunter - Complete Product Architecture & Lead Intelligence Blueprint v2.0
Before every action call a policy decision such as PolicyEngine.canContact(subject, channel, campaign) or 
PolicyEngine.canPublish(content, channel). Log source -> decision -> content/message -> channel -> timestamp -> 
result.
18. Conversion & Learning Loop
 WON
 LOST
 NO_RESPONSE
 NOT_INTERESTED
 FOLLOW_UP
 WRONG_FIT
 MEETING_BOOKED
 ORDER_STARTED
 ORDER_COMPLETED
 CANCELLED/REFUNDED where relevant
Capture value/revenue and reason codes. Learn which personas, signals, sources, messages, content topics, hooks, 
formats, offers, posting times and channels convert for each tenant/product. Seller-specific learning should be favored 
over generic assumptions once enough evidence exists.
19. Attribution & ROI
 Track signal/content/ad -> engagement/outreach -> conversation -> qualified -> sale -> revenue.
 Use campaign/source/message/content IDs and UTM/referral identifiers where appropriate.
 Dashboard: content reach, meaningful engagement, opportunities, qualified leads, customers won, revenue 
attributed, cost per lead, cost per customer, conversion rate and channel/content ROI.
 Support multi-touch attribution later; begin with transparent, explainable attribution rather than opaque AI 
claims.
20. Experimentation Engine
 A/B test messages, CTAs, audiences, offers, channels, content hooks, formats and send/publish times.
 Set minimum sample sizes and budget limits.
 Do not continuously change strategy on tiny samples.
 Show recommendations with evidence, e.g. a content format or message has materially higher reply/conversion 
rate.
 Allow seller to lock brand-critical copy/claims and campaign creative.
21. Connector Architecture
Do not hard-code every platform into campaign logic. Use adapters with capability declarations.
Interface Responsibility
DiscoveryProvider Find business/public-intent opportunities
EnrichmentProvider Add permitted company/contact/context data
MessagingProvider Send/read permitted conversations
SocialPublishingProvider Create/schedule/publish/read status for supported social content
SocialListeningProvider Read permitted mentions/comments/public conversations and 
engagement events

BizHunter - Complete Product Architecture & Lead Intelligence Blueprint v2.0
AdsProvider Audience/campaign/creative operations
CRMProvider Import/export leads, contacts and outcomes
CommerceProvider Orders, products, stock, checkout/conversion
AnalyticsProvider Events, content performance, attribution and commercial outcomes
Each connector must expose supported actions, rate limits, permission requirements, error state, webhook/event 
support and data provenance.
22. Recommended mobile UX
Stage User sees
Add Product Image/URL/details + AI extraction
Goal Find businesses / Find consumers / Grow social / Create demand / 
Get enquiries / Book meetings / Generate sales
Recommended Strategy Hunt + content strategy, target, channels and evidence sources
Content Plan Pillars, campaign ideas, formats, calendar and creative briefs
Create Content Caption/script/creative direction + asset selection
Content Calendar Draft / Needs Approval / Scheduled / Published
Targeting Contextual B2B or consumer controls
Opportunities Ranked cards + Why this lead?
Outreach Instructions Brief BizHunter before communication
Message Preview Edit/regenerate/approve/schedule
Agent Active / Scheduled / Completed hunts and campaigns
Messages Inbox / Needs Review / Scheduled / Sent
Community Comments / mentions / DMs / intent / support
Opportunity Conversation summary, evidence, value, next action
Analytics Content -> engagement -> leads -> qualified -> customers -> revenue 
-> ROI
Learning What BizHunter learned and recommended changes
23. Implementation priorities
Priority Workstream Reason
P0 Product intelligence + goal engine Route products correctly before 
discovery/content
P0 Provider abstraction + CustomerSignal Avoid source-specific architecture
P0 Knowledge/truth layer Prevent unsupported sales/content claims
P0 Policy + suppression + audit Safe, permission-aware execution
P0 Outreach instructions + preview + schedule Give seller control before automation
P0 Social content model + calendar + approval Establish core social-manager workflow
P0 Conversion outcomes Create the learning foundation
P1 One SocialPublishingProvider integration Prove publishing end-to-end
P1 Community inbox + social event 
normalization Connect engagement to conversations
P1 Intent-to-opportunity conversion Turn relevant engagement into pipeline
P1 Identity resolution Deduplicate customers across channels
P1 First-party enrichment Exploit merchant-owned high-value signals
P1 One public-intent provider Prove B2C intent end-to-end compliantly
P1 Unified inbox + handoff Operationalize conversations
P1 Lead scoring v1 Evidence-based ranking
P1 Content + lead attribution Prove commercial value
P2 Social listening adapters Expand demand intelligence
P2 Paid acquisition adapters Expand consumer acquisition
P2 Experimentation Optimize messages/content/audiences/offers
P2 Learned scoring Tenant-specific conversion prediction
P2 Multi-touch attribution More sophisticated ROI analysis

BizHunter - Complete Product Architecture & Lead Intelligence Blueprint v2.0
24. Definition of success
BizHunter succeeds when a seller can upload a school system, jersey, handbag, venue, restaurant offer or other 
product and the platform chooses a sensible, evidence-backed and permission-aware route to customers. It can both 
discover existing demand and create new demand through intelligent social media management, convert relevant 
engagement into opportunities, manage conversations, and measure whether those customers actually converted.
Target architecture
PRODUCT -> UNDERSTAND -> GOAL
      -> [HUNT EXISTING DEMAND] + [CREATE SOCIAL DEMAND]
      -> ENGAGEMENT / SIGNALS -> ENRICH -> RANK -> POLICY CHECK
      -> APPROVED OUTREACH / COMMUNITY RESPONSE
      -> CONVERSATION -> HUMAN HANDOFF -> SALE
      -> ATTRIBUTION -> LEARN
      -> NEXT HUNT + NEXT CONTENT PLAN
Core product thesis: BizHunter should not optimize for 'more posts' or 'more leads' in isolation. It should optimize 
the entire path from product knowledge and demand generation to evidence-backed opportunity, customer 
conversation and attributable commercial outcome.