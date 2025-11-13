// src/services/reputationService.ts
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";

/**
 * Tính toán và cập nhật điểm uy tín cho người dùng dựa trên đánh giá.
 * @param profileId - ID của người dùng (freelancer) được đánh giá
 * @param rating - Điểm đánh giá (1-5)
 * @param completedAt - Thời điểm công việc hoàn thành
 * @param deadline - Hạn chót của công việc
 */
export async function updateReputationScore(
  profileId: string,
  rating: number,
  completedAt: Date,
  deadline: Date | null
) {
  try {
    // 1. Lấy điểm uy tín hiện tại
    const [user] = await db
      .select({ reputationScore: users.reputationScore })
      .from(users)
      .where(eq(users.profileId, profileId));

    if (!user) {
      console.error("User not found for reputation update:", profileId);
      return;
    }

    const currentRep = user.reputationScore;
    let repChange = 0;

    // 2. Tính toán điểm thay đổi (rep_change)
    const isLate = deadline ? completedAt > deadline : false;

    // 2a. Trường hợp bị phạt (Đánh giá xấu)
    if (rating === 1) {
      repChange = -30; // (Quy tắc "1 sao VÀ trễ" đã bao gồm trong quy tắc "1 sao")
    } else if (rating === 2) {
      repChange = -25;
    } else if (rating === 3) {
      repChange = -15;
    }
    // 2b. Trường hợp được thưởng (Đánh giá tốt)
    else if (rating === 4) {
      repChange = 1;
    } else if (rating === 5) {
      repChange = 2;
      // Quy tắc: "hoàn thành tốt trước deadline: +1 (cộng dồn)"
      if (!isLate) {
        repChange += 1; // Tổng cộng là +3
      }
    }

    // 3. Cập nhật Điểm Uy tín (Đảm bảo trong khoảng 0-100)
    const newRep = currentRep + repChange;
    const finalRep = Math.max(0, Math.min(100, newRep));

    // 4. Logic Cảnh cáo/Cấm (Thresholds)
    const isBanned = finalRep < 30;
    // (Nếu điểm < 70 VÀ không bị cấm, thì bị cảnh cáo)
    const isWarned = finalRep < 70 && !isBanned; 

    // 5. Cập nhật database
    await db
      .update(users)
      .set({
        reputationScore: finalRep,
        isBanned: isBanned,
        isWarned: isWarned,
      })
      .where(eq(users.profileId, profileId));

    console.log(
      `Reputation updated for ${profileId}: ${currentRep} -> ${finalRep} (Change: ${repChange})`
    );
  } catch (error) {
    console.error("Failed to update reputation score:", error);
    // (Không ném lỗi, vì việc đánh giá vẫn thành công)
  }
}