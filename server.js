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

// Custom Markdown rules
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

// Add a custom rule for tables
turndownService.addRule('tables', {
    filter: ['table', 'tr', 'td', 'th'],
    replacement: function(content, node) {
        if (node.nodeName === 'TABLE') {
            return '\n\n' + content + '\n\n';
        }
        if (node.nodeName === 'TR') {
            return '|' + content + '|\n';
        }
        if (node.nodeName === 'TD' || node.nodeName === 'TH') {
            return ' ' + content + ' |';
        }
        return content;
    }
});

app.get("/", async (req, res) => {
    const url = req.query.url;
    if (!url) {
        return res.status(400).send("Please provide a URL as ?url=yourpage.com");
    }

    try {
        const { data } = await axios.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
            },
            maxRedirects: 5
        });

        const $ = cheerio.load(data);
        let markdownContent = "";

        // Find all article elements and div.entry-content
        const possibleContainers = $('article, div.entry-content');
        let mainContainer = null;
        let maxLength = 0;

        // Find the container with the most content
        possibleContainers.each((_, element) => {
            const container = $(element);
            // Check if this container has common main content indicators
            const isMainContent = 
                container.attr('id')?.includes('main') || 
                container.attr('class')?.includes('main') ||
                container.attr('role') === 'main' ||
                container.parents('[role="main"]').length > 0;

            const contentLength = container.text().trim().length;
            
            // Prioritize containers that have main content indicators
            // or choose the one with the most content
            if (isMainContent || contentLength > maxLength) {
                maxLength = contentLength;
                mainContainer = container;
            }
        });

        if (mainContainer) {
            // Process all content in document order
            mainContainer.find('h1, h2, h3, h4, h5, h6, p, ul, ol, li, blockquote, table').each((_, element) => {
                markdownContent += turndownService.turndown($.html(element)) + "\n\n";
            });
        }

        if (!markdownContent.trim()) {
            return res.status(404).send("No main content found.");
        }

        // Display the Markdown file in the browser
        res.setHeader("Content-Disposition", "inline");
        res.setHeader("Content-Type", "text/markdown");
        res.send(markdownContent);
    } catch (error) {
        console.error("Error:", error.message);
        return res.status(500).send("Failed to fetch or process the URL.");
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
