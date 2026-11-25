import { getCollection } from 'astro:content';
import type { APIRoute } from 'astro';

export const prerender = true;

const SITE_ORIGIN = 'https://latentsig.com';
const staticPaths = Object.keys(import.meta.glob('./**/*.{astro,md}'))
  .filter((path) => !path.includes('[') && !path.endsWith('/404.astro'))
  .map((path) => {
    const route = path.replace(/^\.\//, '').replace(/\.(?:astro|md)$/, '');
    const cleanRoute = route === 'index' ? '' : route.endsWith('/index') ? route.slice(0, -6) : route;
    return cleanRoute ? '/' + cleanRoute.replace(/\/+$/, '') + '/' : '/';
  });

export const GET: APIRoute = async () => {
  const posts = await getCollection('blog');
  const paths = [...new Set([...staticPaths, ...posts.map((post) => '/blog/' + post.slug + '/')])];
  const entries = paths.map((path) => '  <url><loc>' + SITE_ORIGIN + path + '</loc></url>');
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    '</urlset>',
  ].join('\n');

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
