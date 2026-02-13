/**
 * Mock CAPTCHA detector.
 *
 * Randomly triggers CAPTCHA detection ~10% of the time to simulate
 * real-world CAPTCHA encounters during form filling.
 */
import type {
  ICaptchaDetector,
  CaptchaDetection,
  CaptchaType,
} from "@valet/shared/types";
import { randomDelay, fakeId } from "./base.js";

export class CaptchaDetectorMock implements ICaptchaDetector {
  private triggerRate: number;

  constructor(triggerRate = 0.1) {
    this.triggerRate = triggerRate;
  }

  async detect(_page: unknown): Promise<CaptchaDetection> {
    await randomDelay(200, 500);

    const triggered = Math.random() < this.triggerRate;

    if (!triggered) {
      return { detected: false };
    }

    const types: CaptchaType[] = [
      "recaptcha_v2",
      "recaptcha_v3",
      "hcaptcha",
      "cloudflare_turnstile",
    ];
    const type = types[Math.floor(Math.random() * types.length)]!;

    return {
      detected: true,
      type,
      selector: this.getSelectorForType(type),
      iframeUrl: this.getIframeUrlForType(type),
      screenshotUrl: `https://mock-screenshots.local/captcha-${fakeId()}.png`,
    };
  }

  async classify(detection: CaptchaDetection): Promise<CaptchaType> {
    await randomDelay(100, 300);
    return detection.type ?? "unknown";
  }

  private getSelectorForType(type: CaptchaType): string {
    switch (type) {
      case "recaptcha_v2":
        return "iframe[src*='recaptcha']";
      case "recaptcha_v3":
        return ".grecaptcha-badge";
      case "hcaptcha":
        return "iframe[src*='hcaptcha']";
      case "cloudflare_turnstile":
        return "iframe[src*='challenges.cloudflare.com']";
      default:
        return "#captcha";
    }
  }

  private getIframeUrlForType(type: CaptchaType): string {
    switch (type) {
      case "recaptcha_v2":
      case "recaptcha_v3":
        return "https://www.google.com/recaptcha/api2/anchor?k=mock";
      case "hcaptcha":
        return "https://newassets.hcaptcha.com/captcha/v1/mock";
      case "cloudflare_turnstile":
        return "https://challenges.cloudflare.com/cdn-cgi/challenge-platform/mock";
      default:
        return "https://example.com/captcha/mock";
    }
  }
}
