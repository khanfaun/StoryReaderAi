
import { GoogleGenAI, Type } from "@google/genai";
import type { CharacterStats, Story, Chapter } from "../types";
import { isAiStudio } from './apiKeyService';
import * as apiKeyService from './apiKeyService';

/**
 * Creates a new GoogleGenAI client instance. This is now a simple factory function.
 * @param {string} apiKey - The API key to use.
 * @throws {Error} if the API key is not available.
 * @returns {GoogleGenAI} The initialized GoogleGenAI client.
 */
const getAiClient = (apiKey: string): GoogleGenAI => {
    const keyToUse = isAiStudio() ? process.env.API_KEY! : apiKey;
    if (!keyToUse) {
      throw new Error("API Key is not provided or configured.");
    }
    return new GoogleGenAI({ apiKey: keyToUse });
};

/**
 * Checks if an error is related to quota/billing issues.
 * @param error The error object.
 * @returns True if the error is a quota error, false otherwise.
 */
function isQuotaError(error: any): boolean {
    if (error && typeof error === 'object' && error.status === 429) {
        return true;
    }
    if (error instanceof Error) {
        const message = error.message.toLowerCase();
        return message.includes('quota') || 
               message.includes('billing') || 
               message.includes('resource has been exhausted') ||
               message.includes('429') ||
               message.includes('too many requests');
    }
    return false;
}

/**
 * A robust wrapper for executing Gemini API calls with automatic key rotation and retries on quota errors.
 * @param apiFunction The actual API call to execute. It receives the Gemini client as an argument.
 * @param onKeySwitched An optional callback to notify the UI that the active key has changed.
 * @returns The result of the API call.
 * @throws An error if all keys fail or if a non-quota error occurs.
 */
async function executeApiCallWithRetry<T>(
    apiFunction: (client: GoogleGenAI) => Promise<T>,
    onKeySwitched?: () => void
): Promise<T> {
    const allKeys = apiKeyService.getApiKeys();
    if (allKeys.length === 0) {
        throw new Error("Không có API Key nào được lưu. Vui lòng thêm một key.");
    }

    const activeKey = apiKeyService.getActiveApiKey();
    const startIndex = Math.max(0, activeKey ? allKeys.findIndex(k => k.id === activeKey.id) : 0);
    
    // We will try each key once, starting from the current active one
    for (let i = 0; i < allKeys.length; i++) {
        const keyIndex = (startIndex + i) % allKeys.length;
        const keyToTry = allKeys[keyIndex];

        try {
            // Set this key as active for the current attempt
            apiKeyService.setActiveApiKeyId(keyToTry.id);
            // If we are trying a new key, notify the caller
            if (i > 0 && onKeySwitched) {
                onKeySwitched();
            }

            const client = getAiClient(keyToTry.key);
            // Execute the provided API function
            const result = await apiFunction(client);
            return result; // Success! Exit the loop and return the result.
        
        } catch (error) {
            console.warn(`Thử key ${keyToTry.key.slice(-4)} thất bại. Lỗi:`, error);
            if (isQuotaError(error)) {
                // It's a quota error, let the loop continue to the next key.
                if (i < allKeys.length - 1) {
                    console.log(`Key ${keyToTry.key.slice(-4)} đã hết hạn mức. Tự động chuyển sang key tiếp theo...`);
                }
                continue; 
            } else {
                // It's a different error (e.g., invalid prompt, network issue), so we should not retry.
                // Re-throw the original error to be handled by the UI.
                throw error;
            }
        }
    }

    // If the loop completes, it means all keys failed due to quota issues.
    apiKeyService.setActiveApiKeyId(null); // Deactivate key since all failed
    if (onKeySwitched) onKeySwitched();
    throw new Error("Tất cả các API key đều đã hết hạn mức hoặc không hợp lệ. Vui lòng thêm key mới hoặc kiểm tra lại.");
}


/**
 * Validates a Gemini API key by making a minimal, low-cost call.
 * Throws an error if the key is invalid or the request fails.
 * @param {string} apiKey The API key to validate.
 */
export const validateApiKey = async (apiKey: string): Promise<void> => {
  if (!apiKey || apiKey.trim() === '') {
    throw new Error("API Key không được để trống.");
  }
  
  const validationClient = new GoogleGenAI({ apiKey });
  const activeModel = apiKeyService.getActiveModel();

  try {
    await validationClient.models.generateContent({
        model: activeModel,
        contents: 'Validate',
    });
  } catch (error) {
    console.error("Lỗi xác thực API Key:", error);
    if (error instanceof Error) {
      if (error.message.includes('API key not valid')) {
        throw new Error("API Key không hợp lệ. Vui lòng kiểm tra lại.");
      }
      if (error.message.includes('IAM permission') || error.message.includes('insufficient authentication scopes')) {
         throw new Error("API Key không có quyền truy cập. Vui lòng kiểm tra quyền của key.");
      }
      throw new Error(`Lỗi xác thực API Key: ${error.message}`);
    }
    throw new Error("Không thể xác thực API Key. Vui lòng kiểm tra lại hoặc thử lại sau.");
  }
};

const infoItemArraySchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      ten: { type: Type.STRING, description: "Tên của mục. Ngắn gọn, chính xác." },
      moTa: { type: Type.STRING, description: "Mô tả ngắn gọn về công dụng, nguồn gốc hoặc đặc điểm." },
      status: { type: Type.STRING, description: "Trạng thái: 'active' (còn dùng/còn sống), 'used' (đã dùng hết), 'lost' (bị mất), 'dead' (đã chết), 'destroyed' (bị hủy)." },
    },
    required: ["ten", "moTa"]
  }
};

const primaryCharacterSchemaProperties = {
    trangThai: {
      type: Type.OBJECT,
      description: "Thông tin cơ bản và các đặc tính của nhân vật chính.",
      properties: {
        ten: { type: Type.STRING, description: "Tên nhân vật chính." },
        tuChat: {
          type: Type.ARRAY,
          description: "Danh sách các tư chất, huyết mạch, thể chất đặc biệt, hoặc các trạng thái/danh hiệu đặc biệt của nhân vật.",
          items: {
            type: Type.OBJECT,
            properties: {
              ten: { type: Type.STRING, description: "Tên của đặc tính (ví dụ: Thiên Đạo Trúc Cơ, Bất Tử Thân)." },
              moTa: { type: Type.STRING, description: "Mô tả ngắn gọn về đặc tính đó." }
            },
            required: ["ten", "moTa"]
          }
        }
      },
    },
    canhGioi: {
      type: Type.STRING,
      description: "Cảnh giới tu luyện hiện tại của nhân vật chính.",
    },
    heThongCanhGioi: {
        type: Type.ARRAY,
        description: "Danh sách các cảnh giới tu luyện theo thứ tự từ thấp đến cao được đề cập trong truyện (ví dụ: Luyện Khí, Trúc Cơ, Kim Đan...)",
        items: { type: Type.STRING }
    },
    balo: {
        ...infoItemArraySchema,
        description: "Danh sách các vật phẩm, đan dược, pháp bảo.",
    },
    congPhap: {
        ...infoItemArraySchema,
        description: "Danh sách các công pháp, kỹ năng, thần thông.",
    },
    trangBi: {
        ...infoItemArraySchema,
        description: "Danh sách các trang bị nhân vật đang mặc trên người.",
    },
};

const worldInfoSchemaProperties = {
    npcs: {
      type: Type.ARRAY,
      description: "Danh sách các nhân vật phụ (NPC) quan trọng xuất hiện hoặc được nhắc đến, cùng với mô tả và trạng thái của họ.",
      items: {
        type: Type.OBJECT,
        properties: {
          ten: { type: Type.STRING, description: "Tên của nhân vật phụ." },
          moTa: { type: Type.STRING, description: "Mô tả ngắn gọn về vai trò, phe phái, hoặc ngoại hình của họ." },
          status: { type: Type.STRING, description: "Trạng thái: 'active' nếu còn sống, 'dead' nếu đã chết." },
          mucDoThanThiet: { type: Type.STRING, description: "Mức độ thân thiết với NHÂN VẬT CHÍNH, sử dụng một giá trị từ thang đo quan hệ (ví dụ: 'Đồng Minh', 'Kẻ Thù')." },
          hienThiQuanHe: { type: Type.BOOLEAN, description: "Đặt là true nếu mối quan hệ giữa NPC này và nhân vật chính là quan trọng và nên được hiển thị trên sơ đồ quan hệ." },
          quanHeVoiNhanVatKhac: {
            type: Type.ARRAY,
            description: "Mối quan hệ của NPC này với các nhân vật phụ khác.",
            items: {
                type: Type.OBJECT,
                properties: {
                    nhanVatKhac: { type: Type.STRING, description: "Tên của nhân vật phụ khác." },
                    moTa: { type: Type.STRING, description: "Mô tả mối quan hệ, sử dụng một giá trị từ thang đo quan hệ (ví dụ: 'Đồng Minh', 'Kẻ Thù')." }
                },
                required: ["nhanVatKhac", "moTa"]
            }
          }
        },
        required: ["ten", "moTa"]
      }
    },
    theLuc: {
      type: Type.ARRAY,
      description: "Danh sách các môn phái, gia tộc, hoặc thế lực.",
      items: {
        type: Type.OBJECT,
        properties: {
          ten: { type: Type.STRING, description: "Tên của môn phái hoặc thế lực." },
          moTa: { type: Type.STRING, description: "Mô tả ngắn gọn về thế lực này." },
          status: { type: Type.STRING, description: "Trạng thái: 'active' nếu tồn tại, 'destroyed' nếu bị phá hủy." }
        },
        required: ["ten", "moTa"]
      }
    },
    diaDiem: {
      type: Type.ARRAY,
      description: "Danh sách các địa danh, thành thị, bí cảnh.",
      items: {
        type: Type.OBJECT,
        properties: {
          ten: { type: Type.STRING, description: "Tên của địa điểm." },
          moTa: { type: Type.STRING, description: "Mô tả ngắn gọn về địa điểm này." },
          status: { type: Type.STRING, description: "Trạng thái: 'active' nếu tồn tại, 'destroyed' nếu bị phá hủy." },
          capDo: { type: Type.STRING, description: "Cấp bậc của địa điểm (ví dụ: Giới Vực, Đại Vực, Châu Lục, Khu Vực)." },
          diaDiemCha: { type: Type.STRING, description: "Tên của địa điểm cha mà nó trực thuộc." },
        },
        required: ["ten", "moTa"]
      }
    },
    viTriHienTai: {
        type: Type.STRING,
        description: "Tên của địa điểm cụ thể và chi tiết nhất nơi nhân vật chính đang ở.",
    }
};

const primaryCharacterSchema = { type: Type.OBJECT, properties: primaryCharacterSchemaProperties };
const worldInfoSchema = { type: Type.OBJECT, properties: worldInfoSchemaProperties };
const characterStatsSchema = { type: Type.OBJECT, properties: { ...primaryCharacterSchemaProperties, ...worldInfoSchemaProperties }};


const BASE_PROMPT = `Bạn là một trợ lý quản lý trạng thái thế giới (World State Manager) cho một trò chơi nhập vai dựa trên tiểu thuyết.

**NHIỆM VỤ CỐT LÕI:**
Dựa trên "DỮ LIỆU CŨ" (trạng thái thế giới hiện tại) và "NỘI DUNG CHƯƠNG MỚI", hãy trích xuất báo cáo sự thay đổi (Delta).

**QUY TẮC TRÍCH XUẤT (RẤT QUAN TRỌNG):**
1. **THÊM MỚI (CHÚ Ý TÌM KIẾM):** Nếu có NPC, KẺ ĐỊCH, VẬT PHẨM, CÔNG PHÁP, ĐỊA ĐIỂM, hay THẾ LỰC NÀO ĐƯỢC NHẮC ĐẾN TRONG CHƯƠNG -> Bắt buộc phải trích xuất và thêm mới vào mảng với \`status: 'active'\` (nếu chúng chưa có trong DỮ LIỆU CŨ). Đừng bỏ sót thông tin!
2. **CẬP NHẬT TRẠNG THÁI CŨ:** Nếu mục cũ thay đổi (nhân vật chết, thăng cấp, item bị dùng, môn phái bị diệt) -> Trả về JSON mục đó với \`ten\` (PHẢI GIỮ Y HỆT DỮ LIỆU CŨ) và cập nhật \`moTa\` hoặc \`status\` ('dead', 'used', 'lost', 'destroyed').
3. **CHỈ TRẢ VỀ SỰ THAY ĐỔI:** KHÔNG lặp lại những món đồ, nhân vật, NPC, không có sự kiện gì mới. Nếu một mảng không có thêm mới hay cập nhật gì, hãy trả về mảng rỗng \`[]\`.

**DỮ LIỆU CŨ (Để bạn đối chiếu):**
\`\`\`json
{previousStats}
\`\`\`

**NỘI DUNG CHƯƠNG MỚI:**
"{chapterContent}"`;

// Use active model for analysis
const getAnalysisModel = () => apiKeyService.getActiveModel();

async function executeAnalysis(prompt: string, schema: any, onKeySwitched?: () => void): Promise<{ data: any; usage: { totalTokens: number } }> {
    const { data: response, usage } = await executeApiCallWithRetry(async (client) => {
        const genResponse = await client.models.generateContent({
            model: getAnalysisModel(),
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: schema,
                // thinkingConfig: { thinkingBudget: 0 } // Disable thinking for pure extraction speed
            },
        });
        const usageMetadata = genResponse.usageMetadata || { totalTokenCount: 0 };
        return { data: genResponse, usage: { totalTokens: usageMetadata.totalTokenCount || 0 }};
    }, onKeySwitched);
    
    const jsonText = response.text.trim();
    return {
        data: jsonText ? JSON.parse(jsonText) : null,
        usage: usage
    };
}


export const analyzeChapterForPrimaryCharacter = async (chapterContent: string, previousStats: CharacterStats | null, onKeySwitched?: () => void): Promise<{ data: Partial<CharacterStats> | null, usage: { totalTokens: number }}> => {
    const taskPrompt = `**NHIỆM VỤ CỤ THỂ:**\nHãy phân tích những **THAY ĐỔI MỚI** về vật phẩm, cảnh giới, công pháp của nhân vật chính trong chương này. Trả về mảng rỗng nếu không có gì mới.`;
    const fullPrompt = BASE_PROMPT
        .replace('{previousStats}', JSON.stringify(previousStats ?? {}, null, 2))
        .replace('{chapterContent}', chapterContent.substring(0, 30000)) + `\n\n${taskPrompt}`;
    return executeAnalysis(fullPrompt, primaryCharacterSchema, onKeySwitched);
};

export const analyzeChapterForWorldInfo = async (chapterContent: string, previousStats: CharacterStats | null, onKeySwitched?: () => void): Promise<{ data: Partial<CharacterStats> | null, usage: { totalTokens: number }}> => {
    const taskPrompt = `**NHIỆM VỤ CỤ THỂ:**\nHãy phân tích những **THAY ĐỔI MỚI** về NPC, Thế lực, Địa điểm. Chỉ trả về những NPC mới xuất hiện hoặc NPC cũ bị đổi trạng thái (chết, chuyển phe). Trả về mảng rỗng nếu không có gì mới.`;
    const fullPrompt = BASE_PROMPT
        .replace('{previousStats}', JSON.stringify(previousStats ?? {}, null, 2))
        .replace('{chapterContent}', chapterContent.substring(0, 30000)) + `\n\n${taskPrompt}`;
    return executeAnalysis(fullPrompt, worldInfoSchema, onKeySwitched);
};

export const analyzeChapterForCharacterStats = async (chapterContent: string, previousStats: CharacterStats | null, onKeySwitched?: () => void): Promise<{ data: CharacterStats | null, usage: { totalTokens: number }}> => {
    const isEmptyStats = !previousStats || Object.keys(previousStats).length === 0 || 
        (!previousStats.trangThai?.ten && !(previousStats.npcs?.length) && !(previousStats.balo?.length) && !(previousStats.theLuc?.length));

    let prompt = "";
    if (isEmptyStats) {
        prompt = `Bạn là một trợ lý quản lý trạng thái thế giới (World State Manager) cho một trò chơi nhập vai dựa trên tiểu thuyết.

**NHIỆM VỤ CỐT LÕI:**
Đây là quá trình khởi tạo dữ liệu ban đầu. Hãy ĐỌC TỪNG DÒNG và TRÍCH XUẤT TOÀN BỘ thông tin quan trọng xuất hiện trong chương. LƯU Ý LỚN DÀNH CHO BẠN: KHÔNG ĐƯỢC LƯỜI BIẾNG, PHẢI TRÍCH XUẤT MỌI CHI TIẾT!

**YÊU CẦU TRÍCH XUẤT (BẮT BUỘC):**
1. NHÂN VẬT CHÍNH: Tên nhân vật, **ĐẶC BIỆT LÀ CẢNH GIỚI / CẤP ĐỘ**. Đừng bỏ qua chi tiết này.
2. VẬT PHẨM & TRANG BỊ (BA LÔ): Trích xuất **MỌI TÊN VẬT PHẨM**, linh thạch, bảo vật, vũ khí nhân vật lấy được hoặc đang có.
3. KỸ NĂNG & CÔNG PHÁP: Bất cứ môn võ công, phép thuật nào xuất hiện.
4. THẾ LỰC & ĐỊA ĐIỂM: Tên các Tông Môn, Gia Tộc, Quốc Gia, Các Khu Vực.
5. NPC: Tên kẻ thù, bạn bè, trưởng bối.
6. Nếu truyện nhắc đến, tuyệt đối KHÔNG ĐƯỢC trả về mảng rỗng.

**NỘI DUNG CHƯƠNG:**
"${chapterContent.substring(0, 30000)}"`;
    } else {
        const taskPrompt = `**NHIỆM VỤ CỤ THỂ (PHÂN TÍCH TỈ MỈ - TUYỆT ĐỐI KHÔNG BỎ SÓT):**
Đây là chương tiếp theo. TUYỆT ĐỐI KHÔNG ĐƯỢC LƯỜI BIẾNG, hãy quét từng câu tìm kiếm:
- Đột phá **Cấp độ / Cảnh giới** mới của nhân vật.
- **Vật phẩm mới** (thu thập, mua, cướp) -> Bắt buộc thêm vào mảng Ba Lô.
- **Vật phẩm hao hụt** (sử dụng mất) -> Đổi status thành 'used'.
- **Thế lực / Tông môn mới** xuất hiện.
- Kẻ thù, NPC, Địa điểm mới.

Trả về BÁO CÁO THAY ĐỔI (DELTA DIFF). Chỉ trả về nội dung nếu có SỰ THAY ĐỔI (ví dụ: cấp độ đổi, thêm đồ mới vào balo, thêm NPC). Những thứ MỚI XUẤT HIỆN thì BẮT BUỘC phải có mặt trong kết quả JSON trả về.`;
        
         prompt = BASE_PROMPT
            .replace('{previousStats}', JSON.stringify(previousStats ?? {}, null, 2))
            .replace('{chapterContent}', chapterContent.substring(0, 30000)) + `\n\n${taskPrompt}`;
    }
        
    const { data: stats, usage } = await executeAnalysis(prompt, characterStatsSchema, onKeySwitched);
    
    if (!stats) return { data: null, usage };

    // Check if critical fields are populated (even if empty arrays, it implies the model tried)
    const hasData = stats && typeof stats === 'object';

    const dataToReturn = hasData ? stats : null;
    return { data: dataToReturn, usage };
};


export const chatWithChapterContent = async (prompt: string, chapterContent: string, storyTitle: string, onKeySwitched?: () => void): Promise<{ text: string, usage: { totalTokens: number }}> => {
    const { data: response, usage } = await executeApiCallWithRetry(async (client) => {
        const genResponse = await client.models.generateContent({
            model: apiKeyService.getActiveModel(),
            contents: `**Bối cảnh:** Bạn là một trợ lý AI hữu ích, đang thảo luận về cuốn sách "${storyTitle}".
            **Nhiệm vụ:** Trả lời câu hỏi của người dùng chỉ dựa vào nội dung được cung cấp từ chương truyện hiện tại. Nếu câu trả lời không có trong văn bản, hãy nói rằng bạn không tìm thấy thông tin trong đoạn trích này.

            **Nội dung chương:**
            ---
            ${chapterContent.substring(0, 20000)}
            ---

            **Câu hỏi của người dùng:** "${prompt}"

            **Câu trả lời của bạn:**`,
        });
        const usageMetadata = genResponse.usageMetadata || { totalTokenCount: 0 };
        return { data: genResponse, usage: { totalTokens: usageMetadata.totalTokenCount || 0 }};
    }, onKeySwitched);

    return { text: response.text, usage };
};


export const chatWithEbook = async (prompt: string, zipInstance: any, chapterList: Chapter[], onKeySwitched?: () => void): Promise<{ text: string, usage: { totalTokens: number }}> => {
    let totalUsage = 0;

    const { data: chapterSelectionResponse, usage: usage1 } = await executeApiCallWithRetry(async (client) => {
        const chapterListText = chapterList.map((c, i) => `${i + 1}. Tiêu đề: "${c.title}", Tên file: "${c.url}"`).join('\n');
        const genResponse = await client.models.generateContent({
            model: apiKeyService.getActiveModel(),
            contents: `Người dùng đang hỏi câu này về một cuốn sách: "${prompt}".
            
            Dựa vào danh sách chương dưới đây, hãy xác định những chương có khả năng chứa câu trả lời nhất.
            
            Danh sách chương:
            ${chapterListText}

            Hãy trả về một danh sách các tên file (filename) có liên quan nhất. Chỉ bao gồm tối đa 5 file có liên quan nhất.`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        relevant_files: {
                            type: Type.ARRAY,
                            description: "Một mảng các chuỗi tên file (url) từ danh sách chương được cung cấp.",
                            items: { type: Type.STRING }
                        }
                    }
                }
            }
        });
        const usageMetadata = genResponse.usageMetadata || { totalTokenCount: 0 };
        return { data: genResponse, usage: { totalTokens: usageMetadata.totalTokenCount || 0 }};
    }, onKeySwitched);
    
    totalUsage += usage1.totalTokens;
    
    const relevantFilesData = JSON.parse(chapterSelectionResponse.text) as { relevant_files: string[] };
    const relevantFiles = relevantFilesData.relevant_files;

    if (!relevantFiles || relevantFiles.length === 0) {
      return { 
        text: "Tôi không tìm thấy chương nào có vẻ liên quan đến câu hỏi của bạn trong Ebook này.",
        usage: { totalTokens: totalUsage }
      };
    }

    let contextContent = "";
    const parser = new DOMParser();

    for (const filePath of relevantFiles) {
      const decodedPath = decodeURIComponent(filePath);
      const chapterFile = zipInstance.file(decodedPath);
      if (chapterFile) {
        const rawHtml = await chapterFile.async('string');
        const doc = parser.parseFromString(rawHtml, 'text/html');
        const contentEl = doc.body;
        contentEl.querySelectorAll('a, sup, sub, script, style, img, svg').forEach((el: HTMLElement) => el.remove());
        const text = (contentEl.textContent ?? '').trim();
        contextContent += `--- Nội dung từ file: ${decodedPath} ---\n${text}\n\n`;
      }
    }

    if (!contextContent.trim()) {
      return {
        text: "Tôi đã xác định được các chương liên quan nhưng không thể trích xuất nội dung từ chúng. File Ebook có thể bị lỗi.",
        usage: { totalTokens: totalUsage }
      };
    }

    const { data: finalAnswerResponse, usage: usage2 } = await executeApiCallWithRetry(async (client) => {
        const genResponse = await client.models.generateContent({
            model: apiKeyService.getActiveModel(),
            contents: `**Nhiệm vụ:** Trả lời câu hỏi của người dùng một cách ngắn gọn và súc tích, chỉ dựa vào nội dung được cung cấp dưới đây. Nếu câu trả lời không có trong văn bản, hãy nói rằng bạn không tìm thấy thông tin trong đoạn trích này.
            
            **Nội dung được cung cấp:**
            ${contextContent.substring(0, 20000)}

            **Câu hỏi của người dùng:** "${prompt}"

            **Câu trả lời của bạn:**`,
        });
        const usageMetadata = genResponse.usageMetadata || { totalTokenCount: 0 };
        return { data: genResponse, usage: { totalTokens: usageMetadata.totalTokenCount || 0 }};
    }, onKeySwitched);
    
    totalUsage += usage2.totalTokens;

    return {
      text: finalAnswerResponse.text,
      usage: { totalTokens: totalUsage }
    };
};

export const rewriteChapterContent = async (content: string, onKeySwitched?: () => void): Promise<{ text: string, usage: { totalTokens: number } }> => {
    // For rewriting/creative tasks, Flash is usually sufficient and much faster/cheaper.
    const prompt = `Bạn là một biên tập viên tiểu thuyết chuyên nghiệp và một dịch giả đại tài.
Nhiệm vụ của bạn là viết lại (biên tập lại) đoạn văn bản dưới đây thành tiếng Việt trôi chảy, tự nhiên, và dễ hiểu, phù hợp với văn phong truyện tiểu thuyết.

**YÊU CẦU CỤ THỂ:**
1.  **Xử lý văn phong Convert/Dịch máy:** Nếu văn bản đầu vào là dạng "convert" (Hán Việt thô, ví dụ: "hắn là một cái giỏi giang thần y"), hãy chuyển ngữ sang tiếng Việt thuần việt, mượt mà (ví dụ: "Hắn là một vị thần y tài giỏi").
2.  **Dịch thuật:** Nếu văn bản là tiếng nước ngoài (Anh, Trung, v.v.), hãy dịch sang tiếng Việt.
3.  **Giữ nguyên ý nghĩa:** Tuyệt đối không thay đổi cốt truyện, tình tiết, hoặc ý nghĩa của câu chuyện.
4.  **Giữ nguyên định dạng:** Giữ lại các đoạn văn (xuống dòng) như bản gốc để dễ đọc.
5.  **Văn phong:** Sử dụng từ ngữ phong phú, gợi hình, gợi cảm, phù hợp với ngữ cảnh (tiên hiệp, kiếm hiệp, hiện đại, v.v.).
6.  **QUAN TRỌNG: CHỈ TRẢ VỀ NỘI DUNG ĐÃ VIẾT LẠI.** Không được thêm bất kỳ lời chào, lời dẫn (như "Dưới đây là...", "Tuyệt vời...", "Bản biên tập:"), hay kết luận nào. Trả về text thuần túy.

**VĂN BẢN GỐC:**
---
${content.substring(0, 20000)}
---

**BẢN VIẾT LẠI (TIẾNG VIỆT):**`;

    const { data: response, usage } = await executeApiCallWithRetry(async (client) => {
        const genResponse = await client.models.generateContent({
            model: apiKeyService.getActiveModel(),
            contents: prompt,
        });
        const usageMetadata = genResponse.usageMetadata || { totalTokenCount: 0 };
        return { data: genResponse, usage: { totalTokens: usageMetadata.totalTokenCount || 0 }};
    }, onKeySwitched);

    return { text: response.text, usage };
};
