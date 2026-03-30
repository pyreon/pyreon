import { describe, expect, it } from "vitest";
import { generateRobots, generateSitemap, jsonLd } from "../seo";

describe("generateSitemap", () => {
  const config = { origin: "https://example.com" };

  it("generates sitemap from route files", () => {
    const files = ["index.tsx", "about.tsx", "posts/index.tsx"];
    const sitemap = generateSitemap(files, config);

    expect(sitemap).toContain('<?xml version="1.0"');
    expect(sitemap).toContain("<loc>https://example.com</loc>");
    expect(sitemap).toContain("<loc>https://example.com/about</loc>");
    expect(sitemap).toContain("<loc>https://example.com/posts/</loc>");
  });

  it("excludes layout, error, and loading files", () => {
    const files = ["index.tsx", "_layout.tsx", "_error.tsx", "_loading.tsx"];
    const sitemap = generateSitemap(files, config);

    expect(sitemap).toContain("<loc>https://example.com</loc>");
    expect(sitemap).not.toContain("_layout");
    expect(sitemap).not.toContain("_error");
    expect(sitemap).not.toContain("_loading");
  });

  it("skips dynamic routes", () => {
    const files = ["index.tsx", "posts/[id].tsx", "blog/[...slug].tsx"];
    const sitemap = generateSitemap(files, config);

    expect(sitemap).toContain("<loc>https://example.com</loc>");
    expect(sitemap).not.toContain("[id]");
    expect(sitemap).not.toContain("[...slug]");
  });

  it("strips route groups from paths", () => {
    const files = ["(admin)/dashboard.tsx"];
    const sitemap = generateSitemap(files, config);

    expect(sitemap).toContain("<loc>https://example.com/dashboard</loc>");
    expect(sitemap).not.toContain("(admin)");
  });

  it("respects exclude paths", () => {
    const files = ["index.tsx", "about.tsx", "admin/settings.tsx"];
    const sitemap = generateSitemap(files, {
      ...config,
      exclude: ["/admin"],
    });

    expect(sitemap).toContain("<loc>https://example.com</loc>");
    expect(sitemap).toContain("<loc>https://example.com/about</loc>");
    expect(sitemap).not.toContain("admin");
  });

  it("includes additional paths for dynamic routes", () => {
    const files = ["index.tsx"];
    const sitemap = generateSitemap(files, {
      ...config,
      additionalPaths: [
        { path: "/posts/1", changefreq: "daily", priority: 0.9 },
        { path: "/posts/2", lastmod: "2026-03-01" },
      ],
    });

    expect(sitemap).toContain("<loc>https://example.com/posts/1</loc>");
    expect(sitemap).toContain("<changefreq>daily</changefreq>");
    expect(sitemap).toContain("<priority>0.9</priority>");
    expect(sitemap).toContain("<lastmod>2026-03-01</lastmod>");
  });

  it("uses custom changefreq and priority", () => {
    const files = ["index.tsx"];
    const sitemap = generateSitemap(files, {
      ...config,
      changefreq: "daily",
      priority: 1.0,
    });

    expect(sitemap).toContain("<changefreq>daily</changefreq>");
    expect(sitemap).toContain("<priority>1</priority>");
  });
});

describe("generateRobots", () => {
  it("generates default robots.txt", () => {
    const robots = generateRobots();
    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Allow: /");
  });

  it("generates robots with custom rules", () => {
    const robots = generateRobots({
      rules: [
        { userAgent: "*", allow: ["/"], disallow: ["/admin", "/api"] },
        { userAgent: "Googlebot", allow: ["/"], crawlDelay: 2 },
      ],
    });

    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Disallow: /admin");
    expect(robots).toContain("Disallow: /api");
    expect(robots).toContain("User-agent: Googlebot");
    expect(robots).toContain("Crawl-delay: 2");
  });

  it("includes sitemap URL", () => {
    const robots = generateRobots({
      sitemap: "https://example.com/sitemap.xml",
    });

    expect(robots).toContain("Sitemap: https://example.com/sitemap.xml");
  });

  it("includes host directive", () => {
    const robots = generateRobots({
      host: "https://example.com",
    });

    expect(robots).toContain("Host: https://example.com");
  });
});

describe("jsonLd", () => {
  it("generates JSON-LD script tag", () => {
    const result = jsonLd({
      "@type": "WebSite",
      name: "My Site",
      url: "https://example.com",
    });

    expect(result).toContain('<script type="application/ld+json">');
    const jsonStr = result.slice(result.indexOf(">") + 1, result.lastIndexOf("<"));
    const data = JSON.parse(jsonStr);
    expect(data["@context"]).toBe("https://schema.org");
    expect(data["@type"]).toBe("WebSite");
    expect(data.name).toBe("My Site");
  });

  it("preserves all data fields", () => {
    const result = jsonLd({
      "@type": "Article",
      headline: "Test Article",
      author: { "@type": "Person", name: "Author" },
    });

    const jsonStr = result.slice(result.indexOf(">") + 1, result.lastIndexOf("<"));
    const data = JSON.parse(jsonStr);
    expect(data.headline).toBe("Test Article");
    expect(data.author.name).toBe("Author");
  });
});
