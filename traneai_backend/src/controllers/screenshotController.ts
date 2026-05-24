import { Request, Response } from 'express';
import puppeteer from 'puppeteer';

export async function takeScreenshot(req: Request, res: Response): Promise<void> {
  const { url } = req.body;

  if (!url) {
    res.status(400).json({ error: 'URL is required' });
    return;
  }

  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    // Set viewport size
    await page.setViewport({ width: 1280, height: 800 });
    
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    
    const screenshot = await page.screenshot({ encoding: 'base64', fullPage: false });
    
    await browser.close();

    res.json({ 
      image: screenshot,
      url: url
    });
  } catch (error: any) {
    console.error('Screenshot error:', error);
    res.status(500).json({ error: `Failed to take screenshot: ${error.message}` });
  }
}
