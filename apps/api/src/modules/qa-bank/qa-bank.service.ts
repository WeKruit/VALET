import type { QaBankRepository, QaEntryRecord } from "./qa-bank.repository.js";
import { AppError } from "../../common/errors.js";
import type {
  QaCategory,
  QaUsageMode,
  AnswerSource,
} from "@valet/shared/schemas";

export class QaBankService {
  private qaBankRepo: QaBankRepository;

  constructor({ qaBankRepo }: { qaBankRepo: QaBankRepository }) {
    this.qaBankRepo = qaBankRepo;
  }

  async getQuestions(userId: string, category?: string) {
    return this.qaBankRepo.findByUserId(userId, category);
  }

  async saveAnswer(
    userId: string,
    data: {
      category: QaCategory;
      question: string;
      answer: string;
      usageMode?: QaUsageMode;
      source?: AnswerSource;
    },
  ) {
    return this.qaBankRepo.create({
      userId,
      category: data.category,
      question: data.question,
      answer: data.answer,
      usageMode: data.usageMode ?? "always_use",
      source: data.source ?? "user_input",
    });
  }

  async updateAnswer(
    id: string,
    userId: string,
    data: { answer?: string; usageMode?: QaUsageMode },
  ): Promise<QaEntryRecord> {
    const entry = await this.qaBankRepo.findById(id, userId);
    if (!entry) throw AppError.notFound("Q&A entry not found");
    const updated = await this.qaBankRepo.update(id, data);
    if (!updated) throw AppError.notFound("Q&A entry not found");
    return updated;
  }

  async deleteAnswer(id: string, userId: string) {
    const entry = await this.qaBankRepo.findById(id, userId);
    if (!entry) throw AppError.notFound("Q&A entry not found");
    await this.qaBankRepo.delete(id);
  }

  async discoverQuestions(
    userId: string,
    questions: Array<{ question: string; category: string }>,
  ): Promise<QaEntryRecord[]> {
    const results: QaEntryRecord[] = [];
    for (const q of questions) {
      const existing = await this.qaBankRepo.findByQuestion(
        userId,
        q.question,
      );
      if (!existing) {
        const entry = await this.qaBankRepo.create({
          userId,
          category: q.category as QaCategory,
          question: q.question,
          answer: "",
          usageMode: "ask_each_time",
          source: "application_learned",
        });
        results.push(entry);
      } else {
        results.push(existing);
      }
    }
    return results;
  }
}
