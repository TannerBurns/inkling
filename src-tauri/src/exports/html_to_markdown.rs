//! HTML to Markdown Converter
//!
//! Converts TipTap HTML content to Markdown for document export.

use regex::Regex;

/// Convert HTML content to Markdown
pub fn html_to_markdown(html: &str) -> String {
    if html.is_empty() {
        return String::new();
    }

    let mut result = html.to_string();

    // Remove doctype and html/head/body tags if present
    result = Regex::new(r"<!DOCTYPE[^>]*>")
        .unwrap()
        .replace_all(&result, "")
        .to_string();
    result = Regex::new(r"(?s)<html[^>]*>|</html>|<head[^>]*>.*?</head>|<body[^>]*>|</body>")
        .unwrap()
        .replace_all(&result, "")
        .to_string();

    // Convert headings (using (?s) for multiline content)
    for level in (1..=6).rev() {
        let pattern = format!(r"(?s)<h{level}[^>]*>(.*?)</h{level}>", level = level);
        let replacement = format!("{} $1\n\n", "#".repeat(level));
        result = Regex::new(&pattern)
            .unwrap()
            .replace_all(&result, replacement.as_str())
            .to_string();
    }

    // Convert paragraphs (using (?s) for multiline content)
    result = Regex::new(r"(?s)<p[^>]*>(.*?)</p>")
        .unwrap()
        .replace_all(&result, "$1\n\n")
        .to_string();

    // Convert strong/bold (using (?s) for multiline content)
    result = Regex::new(r"(?s)<strong[^>]*>(.*?)</strong>")
        .unwrap()
        .replace_all(&result, "**$1**")
        .to_string();
    result = Regex::new(r"(?s)<b[^>]*>(.*?)</b>")
        .unwrap()
        .replace_all(&result, "**$1**")
        .to_string();

    // Convert emphasis/italic (using (?s) for multiline content)
    result = Regex::new(r"(?s)<em[^>]*>(.*?)</em>")
        .unwrap()
        .replace_all(&result, "*$1*")
        .to_string();
    result = Regex::new(r"(?s)<i[^>]*>(.*?)</i>")
        .unwrap()
        .replace_all(&result, "*$1*")
        .to_string();

    // Convert strikethrough (using (?s) for multiline content)
    result = Regex::new(r"(?s)<s[^>]*>(.*?)</s>")
        .unwrap()
        .replace_all(&result, "~~$1~~")
        .to_string();
    result = Regex::new(r"(?s)<strike[^>]*>(.*?)</strike>")
        .unwrap()
        .replace_all(&result, "~~$1~~")
        .to_string();
    result = Regex::new(r"(?s)<del[^>]*>(.*?)</del>")
        .unwrap()
        .replace_all(&result, "~~$1~~")
        .to_string();

    // Convert inline code (using (?s) for multiline content)
    result = Regex::new(r"(?s)<code[^>]*>(.*?)</code>")
        .unwrap()
        .replace_all(&result, "`$1`")
        .to_string();

    // Convert code blocks (pre > code) - already uses [\s\S] for multiline
    result = Regex::new(r#"(?s)<pre[^>]*><code[^>]*class="language-([^"]*)"[^>]*>(.*?)</code></pre>"#)
        .unwrap()
        .replace_all(&result, "```$1\n$2\n```\n\n")
        .to_string();
    result = Regex::new(r"(?s)<pre[^>]*><code[^>]*>(.*?)</code></pre>")
        .unwrap()
        .replace_all(&result, "```\n$1\n```\n\n")
        .to_string();
    result = Regex::new(r"(?s)<pre[^>]*>(.*?)</pre>")
        .unwrap()
        .replace_all(&result, "```\n$1\n```\n\n")
        .to_string();

    // Convert blockquotes (using (?s) for multiline content)
    result = Regex::new(r"(?s)<blockquote[^>]*>(.*?)</blockquote>")
        .unwrap()
        .replace_all(&result, |caps: &regex::Captures| {
            let content = &caps[1];
            let lines: Vec<&str> = content.trim().lines().collect();
            lines
                .iter()
                .map(|line| format!("> {}", line.trim()))
                .collect::<Vec<_>>()
                .join("\n")
                + "\n\n"
        })
        .to_string();

    // Convert unordered lists (using (?s) for multiline content)
    result = Regex::new(r"(?s)<ul[^>]*>(.*?)</ul>")
        .unwrap()
        .replace_all(&result, |caps: &regex::Captures| {
            let inner = &caps[1];
            let items = Regex::new(r"(?s)<li[^>]*>(.*?)</li>")
                .unwrap()
                .captures_iter(inner)
                .map(|cap| format!("- {}", cap[1].trim()))
                .collect::<Vec<_>>()
                .join("\n");
            format!("{}\n\n", items)
        })
        .to_string();

    // Convert ordered lists (using (?s) for multiline content)
    result = Regex::new(r"(?s)<ol[^>]*>(.*?)</ol>")
        .unwrap()
        .replace_all(&result, |caps: &regex::Captures| {
            let inner = &caps[1];
            let items: Vec<String> = Regex::new(r"(?s)<li[^>]*>(.*?)</li>")
                .unwrap()
                .captures_iter(inner)
                .enumerate()
                .map(|(i, cap)| format!("{}. {}", i + 1, cap[1].trim()))
                .collect();
            format!("{}\n\n", items.join("\n"))
        })
        .to_string();

    // Convert task lists (checkbox items) - using (?s) for multiline content
    result = Regex::new(r#"(?s)<li[^>]*data-checked="true"[^>]*>(.*?)</li>"#)
        .unwrap()
        .replace_all(&result, "- [x] $1")
        .to_string();
    result = Regex::new(r#"(?s)<li[^>]*data-checked="false"[^>]*>(.*?)</li>"#)
        .unwrap()
        .replace_all(&result, "- [ ] $1")
        .to_string();

    // Convert links (using (?s) for multiline content)
    result = Regex::new(r#"(?s)<a[^>]*href="([^"]*)"[^>]*>(.*?)</a>"#)
        .unwrap()
        .replace_all(&result, "[$2]($1)")
        .to_string();

    // Convert images
    result = Regex::new(r#"<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*/?"#)
        .unwrap()
        .replace_all(&result, "![$2]($1)")
        .to_string();
    result = Regex::new(r#"<img[^>]*src="([^"]*)"[^>]*/?"#)
        .unwrap()
        .replace_all(&result, "![]($1)")
        .to_string();

    // Convert horizontal rules
    result = Regex::new(r"<hr[^>]*/?>")
        .unwrap()
        .replace_all(&result, "\n---\n\n")
        .to_string();

    // Convert line breaks
    result = Regex::new(r"<br[^>]*/?>")
        .unwrap()
        .replace_all(&result, "\n")
        .to_string();

    // Convert divs to newlines (TipTap sometimes uses divs) - using (?s) for multiline
    result = Regex::new(r"(?s)<div[^>]*>(.*?)</div>")
        .unwrap()
        .replace_all(&result, "$1\n")
        .to_string();

    // Remove remaining HTML tags
    result = Regex::new(r"<[^>]+>")
        .unwrap()
        .replace_all(&result, "")
        .to_string();

    // Decode HTML entities
    result = result.replace("&nbsp;", " ");
    result = result.replace("&amp;", "&");
    result = result.replace("&lt;", "<");
    result = result.replace("&gt;", ">");
    result = result.replace("&quot;", "\"");
    result = result.replace("&#39;", "'");
    result = result.replace("&apos;", "'");

    // Clean up extra whitespace
    result = Regex::new(r"\n{3,}")
        .unwrap()
        .replace_all(&result, "\n\n")
        .to_string();

    result.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_headings() {
        assert_eq!(html_to_markdown("<h1>Hello</h1>"), "# Hello");
        assert_eq!(html_to_markdown("<h2>World</h2>"), "## World");
    }

    #[test]
    fn test_paragraphs() {
        assert_eq!(
            html_to_markdown("<p>Hello World</p>"),
            "Hello World"
        );
    }

    #[test]
    fn test_formatting() {
        assert_eq!(html_to_markdown("<strong>bold</strong>"), "**bold**");
        assert_eq!(html_to_markdown("<em>italic</em>"), "*italic*");
        assert_eq!(html_to_markdown("<code>code</code>"), "`code`");
    }

    #[test]
    fn test_lists() {
        assert_eq!(
            html_to_markdown("<ul><li>one</li><li>two</li></ul>"),
            "- one\n- two"
        );
    }

    #[test]
    fn test_links() {
        assert_eq!(
            html_to_markdown(r#"<a href="https://example.com">Example</a>"#),
            "[Example](https://example.com)"
        );
    }
}

