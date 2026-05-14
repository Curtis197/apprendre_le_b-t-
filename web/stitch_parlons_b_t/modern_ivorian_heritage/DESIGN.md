---
name: Modern Ivorian Heritage
colors:
  surface: '#fbf9f5'
  surface-dim: '#dbdad6'
  surface-bright: '#fbf9f5'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3ef'
  surface-container: '#efeeea'
  surface-container-high: '#eae8e4'
  surface-container-highest: '#e4e2de'
  on-surface: '#1b1c1a'
  on-surface-variant: '#594238'
  inverse-surface: '#30312e'
  inverse-on-surface: '#f2f0ed'
  outline: '#8c7166'
  outline-variant: '#e0c0b2'
  surface-tint: '#a23f00'
  primary: '#9e3d00'
  on-primary: '#ffffff'
  primary-container: '#c64f00'
  on-primary-container: '#fffbff'
  inverse-primary: '#ffb595'
  secondary: '#006d38'
  on-secondary: '#ffffff'
  secondary-container: '#94f4ad'
  on-secondary-container: '#00723a'
  tertiary: '#735c00'
  on-tertiary: '#ffffff'
  tertiary-container: '#cea700'
  on-tertiary-container: '#4e3e00'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdbcd'
  primary-fixed-dim: '#ffb595'
  on-primary-fixed: '#351000'
  on-primary-fixed-variant: '#7c2e00'
  secondary-fixed: '#96f7b0'
  secondary-fixed-dim: '#7bda96'
  on-secondary-fixed: '#00210d'
  on-secondary-fixed-variant: '#005228'
  tertiary-fixed: '#ffe084'
  tertiary-fixed-dim: '#eec209'
  on-tertiary-fixed: '#231b00'
  on-tertiary-fixed-variant: '#574500'
  background: '#fbf9f5'
  on-background: '#1b1c1a'
  surface-variant: '#e4e2de'
typography:
  display-lg:
    fontFamily: Lexend
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Lexend
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Lexend
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
  headline-md:
    fontFamily: Lexend
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  container-max: 1280px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 40px
---

## Brand & Style
The design system is built to bridge the gap between ancient oral traditions and modern digital education. It evokes a sense of "Rooted Modernity"—feeling as stable and grounded as the Ivorian soil, yet as fluid and accessible as a contemporary SaaS platform. 

The aesthetic is a blend of **Corporate Modern** and **Tactile Cultural**. It prioritizes extreme legibility and structural clarity to reduce cognitive load during language acquisition, while using organic colors and geometric patterns to create a warm, inviting environment. The goal is to make the learner feel they are entering a digital classroom that honors the Bété culture through every pixel.

## Colors
The palette is derived from the natural landscape of the Ivory Coast. 
- **Primary (Terracotta):** Used for primary actions, active states, and brand-critical highlights. It represents the earth and the foundation of the culture.
- **Secondary (Forest Green):** Used for success states, progress indicators, and navigational elements. It provides a calming contrast to the warmth of the orange.
- **Accents (Warm Gold):** Reserved for achievements, rewards, and "light-bulb" moments in the learning journey.
- **Background (Soft Cream):** A non-pure white (#FDFBF7) reduces eye strain and makes the UI feel more like parchment or natural fabric rather than a sterile screen.

## Typography
This design system utilizes a dual-type approach. **Lexend** is used for all headings and display text; its expanded character widths and friendly terminals make the Bété orthography feel approachable and modern. **Inter** is the workhorse for body text and UI labels, chosen for its exceptional legibility at small sizes and neutral tone that doesn't compete with the expressive headlines.

For Bété-specific characters or tonal marks, ensure the line-height is generous (minimum 1.5x for body) to prevent clipping of diacritics.

## Layout & Spacing
The layout follows a **Fixed Grid** philosophy on desktop to maintain a "book-like" reading experience, while transitioning to a fluid model on mobile. 
- **Grid:** A 12-column system is used for desktop (1280px max-width).
- **Rhythm:** An 8px linear scale governs all padding and margins. 
- **Negative Space:** Generous whitespace is a functional requirement. Lessons should be padded with `spacing.margin-desktop` to ensure the learner's focus remains on the specific linguistic concept being presented.

## Elevation & Depth
The design system uses **Tonal Layers** rather than heavy shadows to indicate hierarchy. 
- **Surface Level 0:** The Soft Cream background.
- **Surface Level 1:** White containers with a very soft, 4% opacity terracotta-tinted shadow. This is used for lesson cards and navigation menus.
- **Patterned Depth:** Subtle geometric Ivory Coast motifs (opacity 3-5%) are used on the base background layer to create a sense of physical texture without distracting from the content.
- **Interaction:** Upon hover, interactive elements should slightly lift with a more pronounced, warm shadow and a 2px Terracotta border.

## Shapes
The shape language is consistently **Rounded** (Level 2). This softens the "educational" aspect of the platform, making it feel less like a rigid textbook and more like a friendly companion. 
- **Primary Buttons:** 0.5rem (8px) radius.
- **Lesson Cards:** 1rem (16px) radius to create a distinct containerized feel.
- **Progress Bars:** Fully pill-shaped (rounded-full) to represent a continuous flow of learning.

## Components
- **Buttons:** Primary buttons use a solid Terracotta fill with white text. Secondary buttons use a Forest Green outline with 1px thickness. All buttons have a minimum height of 48px for accessibility.
- **Vocabulary Cards:** Feature a Lexend Headline MD for the Bété word, a soft divider with a geometric motif, and Inter Body MD for the translation.
- **Progress Indicators:** Use Forest Green for completed segments and a light tint of the same green for remaining tracks. 
- **Input Fields:** Use a 1px border in a muted neutral-gray. On focus, the border shifts to Terracotta with a 2px thickness. Labels always remain visible above the field.
- **Chips/Badges:** Small, rounded-pill indicators for difficulty levels (e.g., "Beginner") using Forest Green backgrounds with white text.
- **Patterned Dividers:** Instead of simple gray lines, use thin, repeating geometric patterns in a light gold or tan to separate major sections of a page.