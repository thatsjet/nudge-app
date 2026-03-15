# Nudge App -- UI/UX Audit & Recommendations

## What's Working Well

- **Warm, earthy color palette** -- the cream/tan/sage tones feel calming and ADHD-friendly. Not clinical.
- **Suggestion chips** on empty state -- great for reducing decision paralysis.
- **Onboarding wizard** -- the 10-step flow with skip options respects user autonomy.
- **Typing indicator** with bouncing dots -- clear feedback during AI processing.
- **Timestamps on hover** -- clean, non-cluttered approach.

---

## High-Impact Recommendations

### 1. Chat Input: Feels Undersized and Disconnected

The input area sits at the bottom with minimal visual weight. For a chat-first app, this is the most important surface.

**Recommendations:**
- Add a subtle inner shadow or slightly elevated background to make it feel like a "stage"
- Increase padding around the input (currently 12px/16px -- go to 16px/20px)
- Add a character/context hint (e.g., "Shift+Enter for new line") as muted text below the input
- Consider adding attachment/file-reference affordance since the app has vault integration

### 2. Empty State: Missed Opportunity for Emotional Connection

The current empty state is functional but generic: logo + "What would you like to work on?" + chips.

**Recommendations:**
- **Time-aware greeting**: "Good morning, Jeremy" or "Winding down for the evening?" based on time of day + energy patterns from onboarding
- **Contextual chips**: rotate suggestions based on time of day and what's in the vault (e.g., "Review today's tasks" in the morning, "Capture what you got done" in the evening)
- **Mantra display**: show the user's chosen mantra subtly below the greeting -- they picked it for a reason
- Increase logo opacity from 0.6 to 0.8 -- it looks washed out currently

### 3. Header: Too Sparse, Emoji Icons Feel Unpolished

The header uses Unicode emoji (folder, gear) which render differently across systems and feel inconsistent with the app's refined palette.

**Recommendations:**
- Replace emoji icons with consistent SVG icons (like the send button already uses)
- Add the current session name or "New conversation" as a subtitle under "Nudge"
- The "+" button for new chat is ambiguous -- add a tooltip or label on hover
- Consider moving the new-chat action into a more prominent position

### 4. Message Bubbles: User Messages Need More Distinction

User messages at 80% width with a tan background are functional but feel flat. The visual hierarchy between user and assistant is weak.

**Recommendations:**
- Give user messages slightly more padding (currently 10px/14px, try 12px/16px)
- Add a very subtle shadow to user bubbles (`box-shadow: 0 1px 2px var(--shadow)`)
- Consider a small user avatar/initial circle on the right edge for user messages
- Assistant messages could benefit from a thin left accent border (like blockquotes) to visually anchor them

### 5. File Explorer: Functional but Dense

401 lines of code for a tree view that's 260px wide -- it's doing a lot. The UI feels like a traditional file browser dropped into a chat app.

**Recommendations:**
- Add section headers (Ideas, Daily, Tasks) with subtle dividers instead of just folder trees
- Show a preview snippet or last-modified date for files
- The context menu is standard -- consider inline swipe actions or more visible quick-actions
- When a file is selected, show it in a split-pane rather than replacing the entire chat

### 6. Onboarding: Too Many Steps for Initial Setup

10 steps is a lot. Users with ADHD are particularly likely to abandon long onboarding flows.

**Recommendations:**
- **Consolidate to 5-6 steps**: merge "aboutMe + energy + preferences" into a single "About You" step with collapsible sections
- Make the vault step automatic (just use default, mention it can be changed) -- one fewer decision
- Add progress percentage (not just dots) -- "Step 3 of 6" is more motivating than 10 tiny dots
- The "ready" step feels redundant -- go directly to the app after mantra with a brief toast notification

### 7. Missing: Session/Conversation Management

There's a "new chat" button but no way to see, search, or resume past conversations from the UI.

**Recommendations:**
- Add a conversation list in the sidebar (alongside or tabbed with file explorer)
- Show recent conversations with first-message preview and date
- Allow starring/pinning important conversations
- This is probably the biggest functional gap for daily-driver use

### 8. Accessibility Gaps

- **No visible focus indicators** on most interactive elements (chips, header buttons)
- **No skip-to-content** landmark for keyboard navigation
- **Color contrast**: `--text-muted` (#9b958f) on `--bg-primary` (#faf9f7) is only ~3.2:1 -- fails WCAG AA for normal text
- **Typing indicator** has no `aria-live` region, so screen readers won't announce it
- Suggestion chips and header buttons lack visible focus-visible outlines

### 9. Micro-Interaction Polish

- **No transition on panel open/close** -- file explorer and file editor just pop in/out. Add a 200ms slide or fade.
- **No feedback on chip click** -- when a suggestion chip is clicked, it should show a brief pressed/active state before the message appears
- **Streaming content** has no entrance animation -- messages could fade in slightly
- **Save status** in the file editor is text-only -- consider a small icon (checkmark/spinner) for faster scanning

### 10. Typography Scale Needs Structure

The app uses ad-hoc font sizes (13px, 14px, 15px, 16px, 18px). There's no defined type scale.

**Recommendations:**
Define a scale in CSS custom properties:
```css
--text-xs: 11px;    /* timestamps */
--text-sm: 13px;    /* secondary text, code */
--text-base: 14px;  /* body */
--text-md: 16px;    /* emphasis, buttons */
--text-lg: 18px;    /* section headings */
--text-xl: 22px;    /* page headings */
--text-2xl: 28px;   /* onboarding headings */
```

---

## Priority Order

| Priority | Recommendation | Effort | Impact |
|----------|---------------|--------|--------|
| 1 | Time-aware greeting + contextual chips | Medium | High -- makes the app feel alive |
| 2 | Replace emoji icons with SVGs | Low | Medium -- instant polish |
| 3 | Session/conversation list | High | High -- critical for daily use |
| 4 | Consolidate onboarding to 5-6 steps | Medium | High -- reduces abandonment |
| 5 | Accessibility fixes (contrast, focus) | Low | High -- usability + compliance |
| 6 | Panel transitions (slide/fade) | Low | Medium -- polish |
| 7 | Chat input enhancement | Low | Medium -- better primary surface |
| 8 | Type scale tokens | Low | Low -- consistency |
| 9 | Message bubble refinement | Low | Low -- visual hierarchy |
| 10 | File explorer redesign | High | Medium -- better vault UX |
