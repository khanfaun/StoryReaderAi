
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
function isQuotaError(error: unknown): boolean {
    if (error instanceof Error) {
        const message = error.message.toLowerCase();
        return message.includes('quota') || 
               message.includes('billing') || 
               message.includes('resource has been exhausted');
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
    const startIndex = activeKey ? allKeys.findIndex(k => k.id === activeKey.id) : 0;
    
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

  try {
    await validationClient.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: 'Validate',
        config: {
            thinkingConfig: { thinkingBudget: 0 },
        },
    });
  } catch (error) {
    console.error("Lỗi xác thực API Key:", error);
    if (error instanceof Error) {
      if (error.message.includes('API key not valid')) {
        throw new Error("API Key không hợp lệ. Vui lòng kiểm tra lại.");
      }
      if (error.message.includes('IAM permission')) {
         throw new Error("API Key không có quyền truy cập. Vui lòng kiểm tra quyền của key.");
      }
    }
    throw new Error("Không thể xác thực API Key. Vui lòng kiểm tra lại hoặc thử lại sau.");
  }
};

const infoItemArraySchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      ten: { type: Type.STRING, description: "Tên của mục." },
      moTa: { type: Type.STRING, description: "Mô tả ngắn gọn về công dụng, nguồn gốc hoặc đặc điểm." },
      status: { type: Type.STRING, description: "Trạng thái: 'active' nếu còn, 'used' nếu dùng hết, 'lost' nếu mất." },
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
        description: "Danh sách các vật phẩm, đan dược, pháp bảo được đề cập trong chương này.",
    },
    congPhap: {
        ...infoItemArraySchema,
        description: "Danh sách các công pháp, kỹ năng, thần thông được đề cập trong chương này.",
    },
    trangBi: {
        ...infoItemArraySchema,
        description: "Danh sách các trang bị nhân vật đang mặc trên người được đề cập trong chương này.",
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
      description: "Danh sách các môn phái, gia tộc, hoặc thế lực được đề cập trong chương.",
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
      description: "Danh sách các địa danh, thành thị, bí cảnh xuất hiện trong chương này.",
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
        description: "Tên của địa điểm cụ thể và chi tiết nhất nơi nhân vật chính đang ở. Giá trị này PHẢI khớp với một trong các tên trong danh sách 'diaDiem'.",
    }
};

const primaryCharacterSchema = { type: Type.OBJECT, properties: primaryCharacterSchemaProperties };
const worldInfoSchema = { type: Type.OBJECT, properties: worldInfoSchemaProperties };
const characterStatsSchema = { type: Type.OBJECT, properties: { ...primaryCharacterSchemaProperties, ...worldInfoSchemaProperties }};


const BASE_PROMPT = `Bạn là một trợ lý phân tích truyện tiên hiệp chuyên nghiệp, có khả năng duy trì và cập nhật trạng thái của thế giới truyện qua từng chương.

**DỮ LIệu HIỆN TẠI:**
Dưới đây là thông tin đã biết về nhân vật và thế giới truyện cho đến trước chương này.
\`\`\`json
{previousStats}
\`\`\`

**QUY TẮC CẬP NHẬT (RẤT QUAN TRỌNG):**
1.  **CHỈ CẬP NHẬT:** Chỉ trả về những thông tin MỚI hoặc BỊ THAY ĐỔI.
    *   **Trường đơn lẻ:** Nếu nhân vật đột phá, chỉ trả về \`canhGioi\` mới.
    *   **Thêm mục mới:** Nếu có NPC mới, chỉ thêm NPC đó vào mảng \`npcs\`.
    *   **Cập nhật mục đã có:** Nếu một NPC đã tồn tại có sự thay đổi (ví dụ: trạng thái đổi thành 'dead' hoặc có thêm mối quan hệ mới), bạn PHẢI trả về TOÀN BỘ đối tượng NPC đó với đầy đủ thông tin (cũ và mới).
2.  **LIÊN KẾT DANH XƯNG VÀ TÊN THẬT:** Chú ý các trường hợp một nhân vật được giới thiệu bằng một danh xưng (ví dụ: 'lão già áo xám') rồi sau đó mới tiết lộ tên thật. Hãy liên kết mô tả đó với tên thật và chỉ ghi nhận nhân vật bằng tên thật của họ.
3.  **XÁC ĐỊNH NHÂN VẬT QUẦN CHÚNG:** Phân biệt rõ ràng giữa nhân vật phụ (NPC) có vai trò và nhân vật quần chúng. KHÔNG đưa nhân vật quần chúng (ví dụ: lính gác, người qua đường không có vai trò) vào danh sách \`npcs\`.
4.  **QUẢN LÝ QUAN HỆ NPC:** Toàn bộ thông tin quan hệ giờ đây được quản lý BÊN TRONG từng đối tượng NPC.
    *   **\`mucDoThanThiet\`**: Mô tả mối quan hệ của NPC với **NHÂN VẬT CHÍNH**. Bắt buộc sử dụng một giá trị từ "THANG ĐO MÔ TẢ QUAN HỆ" (ví dụ: 'Đồng Minh', 'Kẻ Thù').
    *   **\`hienThiQuanHe\`**: Đặt là \`true\` nếu mối quan hệ với nhân vật chính đủ quan trọng để hiển thị trên sơ đồ (thường là bất cứ mức độ nào khác 'Trung Lập').
    *   **\`quanHeVoiNhanVatKhac\`**: Mô tả mối quan hệ của NPC này với các **NPC khác**. Cũng sử dụng "THANG ĐO MÔ TẢ QUAN HỆ" cho trường \`moTa\`.
5.  **VỊ TRÍ HIỆN TẠI:** \`viTriHienTai\` phải khớp chính xác với một địa điểm trong \`diaDiem\` của chương này.

**THANG ĐO MÔ TẢ QUAN HỆ (RẤT QUAN TRỌNG):**
Khi mô tả một mối quan hệ trong trường \`moTa\`, hãy sử dụng các từ khóa sau để thể hiện chính xác sắc thái và mức độ của mối quan hệ đó. Đây là cơ sở để hệ thống hiển thị màu sắc tương ứng theo thứ tự từ cao đến thấp.
*   **Cấp 6: Thân Thiết Tột Cùng (Màu Xanh Lá):** \`sư đồ\`, \`phu thê\`, \`tri kỷ\`, \`huynh đệ kết nghĩa\`, \`gia tộc thân cận\`, \`sống chết có nhau\`, \`trung thành tuyệt đối\`, \`ân nhân cứu mạng\`.
*   **Cấp 5: Đồng Minh / Tích Cực (Màu Xanh Ngọc):** \`đồng minh\`, \`bằng hữu\`, \`đồng môn\`, \`thân hữu\`, \`giúp đỡ\`, \`cảm kích\`, \`tiền bối đáng kính\`.
*   **Cấp 4: Trung Lập (Màu Vàng):** \`giao dịch\`, \`hợp tác tạm thời\`, \`quen biết sơ\`, \`người qua đường\`.
*   **Cấp 3: Mâu Thuẫn / Cạnh Tranh (Màu Cam):** \`đối thủ cạnh tranh\`, \`coi thường\`, \`chán ghét\`, \`xung đột lợi ích\`, \`gây sự\`.
*   **Cấp 2: Thù Địch (Màu Đỏ Hồng):** \`kẻ thù\`, \`đối địch\`, \`phản bội\`, \`hãm hại\`, \`âm mưu\`, \`ghen ghét\`.
*   **Cấp 1: Sinh Tử Đại Địch (Màu Đỏ Sẫm):** \`huyết hải thâm thù\`, \`truy sát đến cùng\`, \`sinh tử đại địch\`, \`diệt tộc\`, \`thù không đội trời chung\`.

**QUY TẮC PHÂN BIỆT (CỰC KỲ QUAN TRỌNG):**
- **CAM (Mâu thuẫn):** Chỉ dùng cho sự cạnh tranh, không ưa nhau, xung đột nhỏ. **KHÔNG** có ý định gây hại nghiêm trọng.
- **ĐỎ HỒNG (Thù địch):** Dùng khi có ý định hoặc hành động hãm hại, phản bội. Mức độ thù ghét rõ ràng.
- **ĐỎ SẪM (Sinh tử):** **CHỈ** dùng cho mối thù sinh tử, không thể hóa giải.

**NỘI DUNG CHƯƠNG MỚI:**
"{chapterContent}"`;

async function executeAnalysis(prompt: string, schema: any, onKeySwitched?: () => void): Promise<{ data: any; usage: { totalTokens: number } }> {
    const { data: response, usage } = await executeApiCallWithRetry(async (client) => {
        const genResponse = await client.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: schema,
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
    const taskPrompt = `**NHIỆM VỤ:**\nĐọc nội dung **CHƯƠNG MỚI** và chỉ trích xuất những thông tin **MỚI** hoặc **THAY ĐỔI** liên quan đến **TRẠNG THÁI CỦA NHÂN VẬT CHÍNH** (tên, cảnh giới, cấp độ, vật phẩm, công pháp, trang bị, tư chất).`;
    const fullPrompt = BASE_PROMPT
        .replace('{previousStats}', JSON.stringify(previousStats ?? {}, null, 2))
        .replace('**NHIỆM VỤ:**', taskPrompt)
        .replace('{chapterContent}', chapterContent.substring(0, 15000));
    return executeAnalysis(fullPrompt, primaryCharacterSchema, onKeySwitched);
};

export const analyzeChapterForWorldInfo = async (chapterContent: string, previousStats: CharacterStats | null, onKeySwitched?: () => void): Promise<{ data: Partial<CharacterStats> | null, usage: { totalTokens: number }}> => {
    const taskPrompt = `**NHIỆM VỤ:**\nĐọc nội dung **CHƯƠNG MỚI** và chỉ trích xuất những thông tin **MỚI** hoặc **THAY ĐỔI** liên quan đến **THẾ GIỚI TRUYỆN** (nhân vật phụ, thế lực, địa điểm, vị trí hiện tại của nhân vật chính).`;
    const fullPrompt = BASE_PROMPT
        .replace('{previousStats}', JSON.stringify(previousStats ?? {}, null, 2))
        .replace('**NHIỆM VỤ:**', taskPrompt)
        .replace('{chapterContent}', chapterContent.substring(0, 15000));
    return executeAnalysis(fullPrompt, worldInfoSchema, onKeySwitched);
};

export const analyzeChapterForCharacterStats = async (chapterContent: string, previousStats: CharacterStats | null, onKeySwitched?: () => void): Promise<{ data: CharacterStats | null, usage: { totalTokens: number }}> => {
    const taskPrompt = `**NHIỆM VỤ:**\nĐọc nội dung **CHƯƠNG MỚI** và chỉ trích xuất những thông tin **MỚI** hoặc **THAY ĐỔI** so với "DỮ LIỆU HIỆN TẠI".`;
     const fullPrompt = BASE_PROMPT
        .replace('{previousStats}', JSON.stringify(previousStats ?? {}, null, 2))
        .replace('**NHIỆM VỤ:**', taskPrompt)
        .replace('{chapterContent}', chapterContent.substring(0, 15000));
        
    const { data: stats, usage } = await executeAnalysis(fullPrompt, characterStatsSchema, onKeySwitched);
    
    if (!stats) return { data: null, usage };

    const hasData = 
        (stats.canhGioi && stats.canhGioi.trim() !== "") ||
        (stats.viTriHienTai && stats.viTriHienTai.trim() !== "") ||
        (stats.heThongCanhGioi && stats.heThongCanhGioi.length > 0) ||
        (stats.balo && stats.balo.length > 0) ||
        (stats.congPhap && stats.congPhap.length > 0) ||
        (stats.trangBi && stats.trangBi.length > 0) ||
        (stats.trangThai && (!!stats.trangThai.ten || !!stats.trangThai.tuChat?.length)) ||
        (stats.npcs && stats.npcs.length > 0) ||
        (stats.theLuc && stats.theLuc.length > 0) ||
        (stats.diaDiem && stats.diaDiem.length > 0) ||
        (stats.quanHe && stats.quanHe.length > 0);

    const dataToReturn = hasData ? stats : null;
    return { data: dataToReturn, usage };
};


export const chatWithChapterContent = async (prompt: string, chapterContent: string, storyTitle: string, onKeySwitched?: () => void): Promise<{ text: string, usage: { totalTokens: number }}> => {
    const { data: response, usage } = await executeApiCallWithRetry(async (client) => {
        const genResponse = await client.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: `**Bối cảnh:** Bạn là một trợ lý AI hữu ích, đang thảo luận về cuốn sách "${storyTitle}".
            **Nhiệm vụ:** Trả lời câu hỏi của người dùng chỉ dựa vào nội dung được cung cấp từ chương truyện hiện tại. Nếu câu trả lời không có trong văn bản, hãy nói rằng bạn không tìm thấy thông tin trong đoạn trích này.

            **Nội dung chương:**
            ---
            ${chapterContent.substring(0, 15000)}
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
            model: "gemini-3-flash-preview",
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
            model: "gemini-3-flash-preview",
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
            model: "gemini-3-flash-preview",
            contents: prompt,
        });
        const usageMetadata = genResponse.usageMetadata || { totalTokenCount: 0 };
        return { data: genResponse, usage: { totalTokens: usageMetadata.totalTokenCount || 0 }};
    }, onKeySwitched);

    return { text: response.text, usage };
};
