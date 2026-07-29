# AI App — Product Specification

## 1. Product Vision

This AI app is a proactive personal improvement system.

Its purpose is to help me take the fastest effective route toward meaningful
improvement. Improvement is determined by my current goals, priorities, and
values rather than by a fixed definition of productivity.

The app should do more than answer questions. It should understand what I am
trying to achieve, observe how I am spending my time, identify distractions or
low-value activities, and intervene when a better action is available.

The desired experience is similar to allowing a trusted, highly capable coach
to actively direct my attention. The app may be assertive, but I retain final
authority. Its interventions must follow permissions and boundaries that I
have explicitly configured.

## 2. Core Objective

At any given moment, the app should help answer:

> Based on my goals, what is the highest-value action I can take right now?

It should then help me take that action with as little friction as possible.

The app should optimize for:

- Fast progress toward active goals
- Continuous personal improvement
- High-value use of time and attention
- Reduced distraction and low-value consumption
- Useful exposure to ideas, information, and inspiration
- Minimal effort required to decide what to do next

## 3. Product Principles

### 3.1 Goals define improvement

The app must understand my active goals before deciding what is valuable. Its
recommendations and interventions should change when my goals change.

### 3.2 Be proactive

The app should not always wait for me to ask for help. It should notice useful
moments to intervene, recommend a better action, and make that action easy to
start.

### 3.3 Optimize for value, not activity

The app should not equate being busy with making progress. It should prioritize
actions with the greatest expected benefit for my goals.

### 3.4 Reduce decision friction

When possible, the app should curate, summarize, rank, and present a small
number of strong options instead of giving me an overwhelming list.

### 3.5 Preserve user authority

The app may strongly guide or redirect me, but I must be able to inspect,
override, pause, and configure its behavior. Destructive, sensitive, or
high-impact actions must require an appropriate level of permission.

## 4. Core Features

### F-001: Goal and Priority System

The app should maintain an understanding of:

- My current goals
- The relative priority of each goal
- Deadlines and time horizons
- Habits or skills I am trying to develop
- Topics and people I want to follow
- Activities I consider valuable or low-value
- Temporary modes such as work, study, recovery, or entertainment

The app should use this information when evaluating content, recommending
actions, and deciding whether to intervene.

#### Requirements

- I can add, edit, pause, complete, and reprioritize goals.
- Goals can include deadlines and measurable outcomes.
- Recommendations should explain which goal they support.
- I can correct the app when it misjudges what is valuable.
- The app should learn from corrections without silently changing important
  permissions or boundaries.

---

### F-002: Scheduled AI Video Prompts

After a configurable interval, the app should prompt me to watch a curated,
high-value AI video.

The prompt should be intentional rather than distracting. It should consider
what I am currently doing, whether interrupting me is appropriate, when I last
watched a recommended video, and how relevant the video is to my goals.

#### Requirements

- I can configure how frequently prompts appear.
- Prompts should be delayed during focus sessions, meetings, sleep, or other
  protected periods.
- Each recommendation should include:
  - The video title and creator
  - Video duration
  - A short explanation of why it is valuable for me
  - The goal or interest it supports
  - A concise preview of what I am likely to learn
- I can watch now, save for later, dismiss, or request another recommendation.
- The app should avoid repeatedly suggesting videos I have already watched or
  rejected.

---

### F-003: Curated Video Library

The app should continuously curate and rank a personal list of videos based on
my goals and interests.

Initial content categories include:

- Artificial intelligence
- Millionaire and billionaire interviews, stories, and analysis
- Business and entrepreneurship
- Alex Hormozi videos
- Philosophy, included occasionally for reflection and broader thinking

#### Requirements

- RePlay is the curated feed of content discovered from followed mentors,
  channels, and sites.
- A curated item cannot be watched directly from the feed. I can add it to
  Inbox, which starts a 20-minute cooldown.
- When the cooldown ends, I can deliberately move the item from Inbox to Queue.
- A YouTube link pasted manually enters Inbox directly and starts the same
  cooldown.
- Queue contains only videos I explicitly intend to watch.
- Recommendations should be ranked by expected value to me, not simply
  popularity or recency.
- The library should show why each video was selected.
- The app should balance immediate practical value with occasional inspiration
  and philosophical perspective.
- I can control the desired frequency or proportion of each category.
- I can mark recommendations as valuable, low-value, already known, or not
  relevant.
- The system should learn from my feedback and viewing history.
- The app should preserve some variety instead of creating an overly narrow
  recommendation loop.

---

### F-004: YouTube Value Evaluation and Redirection

When I am watching a YouTube video, the app should be able to assess whether
the video is a valuable use of my time based on my goals, the content of the
video, its expected information density, and my current context.

If the app determines that a video is low-value, it should offer to:

1. Summarize the useful information in the current video.
2. Explain briefly why continuing may not be the best use of my time.
3. Recommend a more valuable alternative.
4. Open the higher-value video if permitted.

#### Requirements

- The value judgment should be personalized rather than universally applied.
- The app should consider legitimate rest and entertainment goals.
- It should use the transcript and available metadata when evaluating a video.
- It should show a confidence level or concise rationale for its judgment.
- I can continue the current video, request only the summary, switch videos, or
  disable the intervention.
- The app should learn when I disagree with its assessment.
- Automatic redirection must be separately configurable and easy to override.

---

### F-005: Unnecessary Tab and App Management

The app should identify browser tabs and applications that appear unnecessary,
distracting, duplicated, or unrelated to my current goal.

Depending on the permission level I choose, the app should be able to:

- Suggest closing a tab or application
- Group or hide distracting tabs
- Save tabs for later
- Close approved categories of tabs or applications automatically
- Restore recently closed items when possible

#### Requirements

- The app must explain why an item is considered unnecessary.
- Unsaved work must be protected.
- Important, pinned, allowlisted, or work-related items must not be closed
  automatically.
- Automatic closing must be opt-in and governed by clear rules.
- The app should prefer reversible actions such as hiding, grouping, or saving
  for later when appropriate.
- I need an easily accessible activity log and an undo or restore mechanism.
- I can pause all interventions immediately.

---

### F-006: Command-Bar Interface

Pressing `Command + Space` should open a fast text popup similar to Alfred.

The command bar should be the main low-friction interface for interacting with
the app. Because `Command + Space` is commonly used by macOS Spotlight, the
shortcut should be configurable in case of a conflict.

#### Initial capabilities

- Ask the AI a question
- Search the web
- Search curated news
- Open applications, files, websites, or recommended content
- View or change current goals
- Ask what I should do next
- Trigger app actions
- Search previous summaries and saved items

#### Experience requirements

- It should open nearly instantly.
- It should support keyboard-first navigation.
- Results should appear progressively.
- Common actions should require very few keystrokes.
- It should show clearly when an action will affect tabs, applications, files,
  accounts, or external services.

---

### F-007: Personalized News Intelligence

The app should search the web for news and articles related to the topics,
people, companies, industries, and goals I want to track.

It should curate, deduplicate, rank, and summarize the relevant information so
I can understand important developments without reading every source.

#### Requirements

- I can define and edit the subjects I want to track.
- The app should search multiple credible sources.
- It should distinguish the date an article was published from the date the
  reported event occurred.
- Duplicate reports about the same event should be grouped together.
- Each news item should include:
  - A concise summary
  - Why it matters to me
  - The tracked subject or goal it relates to
  - Publication and event dates when available
  - Links to the original sources
- The app should distinguish facts, source claims, and its own inferences.
- It should rank news by relevance and likely impact rather than engagement.
- It should support both on-demand searches from the command bar and scheduled
  briefings.
- I can mark an item as useful, irrelevant, already known, or worth following.

## 5. Intervention Levels

The app should support configurable levels of control:

### Level 1: Observe

The app evaluates activity and records insights but does not interrupt.

### Level 2: Recommend

The app suggests a better action but does not perform it.

### Level 3: Assist

The app prepares the better action—for example, producing a summary or opening
a recommendation—after lightweight confirmation.

### Level 4: Act Within Rules

The app automatically performs explicitly authorized actions, such as closing
known distracting sites during a focus session.

Permission levels may differ by action. For example, the app may automatically
hide entertainment tabs while still requiring confirmation before closing an
application with unsaved work.

## 6. Important Supporting Capabilities

The core features depend on several shared capabilities:

- Persistent goal and preference storage
- Context awareness across time, active apps, tabs, and current mode
- Recommendation ranking
- Web search and source evaluation
- YouTube transcript retrieval and summarization
- Browser and desktop application control
- Notifications and scheduled prompts
- User feedback and personalization
- Permission management
- Activity history, undo, and recovery

## 7. Privacy, Safety, and Trust

Because the app may observe browsing and application activity, trust is a core
product requirement.

- The app should collect only the context required for enabled features.
- I should be able to see what information is being observed and stored.
- Sensitive sites, applications, and data categories should be excludable.
- Credentials and private content should not be included in summaries or logs.
- High-impact actions should require explicit authorization.
- All automatic actions should be traceable.
- Permissions should be revocable at any time.
- The app should provide a prominent pause control.

## 8. Non-Goals

Unless added later, the app is not intended to:

- Maximize productivity every minute without regard for rest or wellbeing
- Treat entertainment as inherently low-value
- Make irreversible decisions without authorization
- Manipulate me using hidden criteria
- Replace my judgment on major personal, financial, medical, or legal decisions
- Optimize for engagement with the app itself

## 9. Suggested Initial Roadmap

### Phase 1: Foundation

- Goal and priority system
- Command-bar interface
- Personalized news search and briefing
- Manually curated video library

### Phase 2: Recommendations

- Automated video discovery and ranking
- Scheduled, context-aware video prompts
- Feedback-driven personalization

### Phase 3: Context Awareness

- YouTube transcript summarization
- Video value evaluation
- Higher-value alternative recommendations
- Awareness of active browser tabs and applications

### Phase 4: Controlled Intervention

- Tab grouping and save-for-later
- Suggested tab and app closing
- Configurable automatic actions
- Complete intervention history and recovery tools

## 10. Open Questions

- What are my initial goals, and how should their priorities be calculated?
- What signals determine whether an activity or video is high-value?
- How often should video prompts and news briefings appear?
- Which video sources and creators should be preferred or excluded?
- Which topics, people, companies, and industries should the news system track?
- What information may the app observe on my computer?
- Which actions can happen automatically, and which always require confirmation?
- Should the first version be a macOS application, browser extension, or a
  combination of both?
- What should happen when wellbeing, rest, and short-term goal progress conflict?

## 11. Product Status

This document currently describes the product vision and initial feature set.
Features listed here are proposed requirements, not confirmation that they have
already been implemented.

Update this document whenever a feature is accepted, rejected, substantially
changed, or implemented.
