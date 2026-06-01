# Max Fuel Prices - Automated Fuel Price Monitoring and Visualization System

A fully automated software suite dedicated to daily market monitoring, advanced graphic visualization, and multi-channel distribution of fuel price information in the Polish retail market.

The system executes a seamless, hands-free operational cycle: it retrieves fresh market data from leading databases, generates high-resolution visual assets optimized for social media, and automatically publishes them directly to connected business profiles.

---

## Core Functional Areas

### 1. Full Process Automation
*   **Autonomous Lifecycle:** The software operates fully independently based on predefined execution schedules, eliminating any need for manual intervention in the daily publishing workflow.
*   **Intelligent Data Detection:** Advanced data verification mechanisms ensure that publishing events only occur once fresh, validated market rates are released, effectively preventing duplicate or blank posts.

### 2. Premium Graphic Design
*   The system generates cohesive visual assets in a modern acrylic glass aesthetic featuring vibrant neon highlights:
    *   **Maximum Price Cards:** Dynamic horizontal boards presenting current statutory maximum rates alongside calculated trends and price differences (increases/decreases) relative to previous periods.
    *   **Weekly Forecast Cards:** A perfectly aligned 2x2 horizontal grid with identical card heights (160px) and clean, unified typography showing projected price ranges for the upcoming week.
*   **Visual Consistency:** Equal card dimensions, custom font pairings using premium typography, and a dedicated brand mascot logo integrated into the footer of every generated asset.

### 3. Advanced Administration Panel (Control Dashboard)
*   A dedicated administrative control panel designed with a clean, glassmorphic dark theme allows the operator to:
    *   Preview generated visual assets in real-time prior to distribution.
    *   Trigger manual publishing events instantly during critical or volatile market shifts.
    *   Manage color theme configurations (including the default deep violet and magenta premium corporate palette).
    *   Configure signature branding tags (defaulted to @MaksymalneCenyPaliw).

---

## Technical Architecture

*   **Application Engine:** Node.js integrated with an Express server for the administrative dashboard.
*   **Scraping Engine:** Highly optimized parsing of raw HTML document structures for instantaneous fuel rate extraction.
*   **Image Processing:** A high-speed Sharp graphic engine dynamically rendering vector SVG templates into high-density raster PNG images.
*   **API Integration:** Direct synchronization with Meta Graph API and Twitter/X API protocols for automated, native posting to business profiles (Facebook, Instagram, Twitter/X).

---

## License
This project is licensed under the terms of the **MIT** License – see the LICENSE file for details.

