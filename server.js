const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const TurndownService = require("turndown");

const app = express();
const port = 3000;
const turndownService = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-"
});

// Markdown formatting rules
turndownService.addRule("strong", {
    filter: ["strong", "b"],
    replacement: (content) => `**${content}**`
});
turndownService.addRule("em", {
    filter: ["em", "i"],
    replacement: (content) => `*${content}*`
});
turndownService.addRule("links", {
    filter: "a",
    replacement: (content, node) => {
        const href = node.getAttribute("href");
        return href ? `[${content}](${href})` : content;
    }
});
turndownService.addRule("images", {
    filter: "img",
    replacement: (content, node) => {
        const src = node.getAttribute("src");
        const alt = node.getAttribute("alt") || "image";
        return src ? `![${alt}](${src})` : "";
    }
});

app.get("/", async (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).send("❌ Please provide a URL as ?url=yourpage.com");

    try {
        const { data } = await axios.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
                "Accept-Encoding": "gzip" // 🏆 Enable gzip compression
            },
            maxRedirects: 3,
            timeout: 8000 // 🏆 Reduce waiting time if the page is slow
        });

        const $ = cheerio.load(data);
        let markdownContent = "";

        // Find the main content (articles, if not inside "related" divs)
        let mainContent = $("article").filter((_, el) => 
            !$(el).parents("[class*='related'], [class*='similar'], [class*='sidebar']").length
        );

        // If no <article> is found, fallback to a large <div>
        if (mainContent.length === 0) {
            mainContent = $("div").filter((_, el) => $(el).text().length > 500).first();
        }

        if (!mainContent || mainContent.text().length < 300) {
            return res.status(404).send("❌ No main content found.");
        }

        // Remove unnecessary elements (ads, share buttons, etc.)
        mainContent.find("aside, .sidebar, .related-posts, .comments, .advertisement, .social-share").remove();

        // Extract only relevant elements
        mainContent.find("h1, h2, h3, h4, p, ul, ol, blockquote").each((_, element) => {
            markdownContent += turndownService.turndown($(element).html()) + "\n\n";
        });

        if (!markdownContent.trim()) return res.status(404).send("❌ No readable content found.");

        // Set response headers and send the markdown result
        res.setHeader("Content-Disposition", "inline");
        res.setHeader("Content-Type", "text/markdown");
        res.send(markdownContent);
    } catch (error) {
        console.error("Error:", error.message);
        return res.status(500).send("❌ Failed to fetch or process the URL.");
    }
});

app.listen(port, () => {
    console.log(`🚀 Server running at http://localhost:${port}`);
});
