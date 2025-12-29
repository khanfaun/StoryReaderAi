
import { GoogleGenAI, Type } from "@google/genai";
import type { CharacterStats, Story, Chapter } from "../types";
import { isAiStudio } from './apiKeyService';

// The AI client instance is now managed dynamically based on the provided API key.
let ai: GoogleGenAI | undefined;
let currentKey: string | undefined;

/**
 * Gets an instance of the GoogleGenAI client, creating or re-creating it if the API key has changed.
 * This function handles the environment-specific key usage (user-provided vs. AI Studio environment).
 * @param {string} apiKey - The API key provided by the user from local storage.
 * @throws {Error} if the API key is not available.
 * @returns {GoogleGenAI} The initialized GoogleGenAI client.
 */
const getAiClient = (apiKey: string): GoogleGenAI => {
    // In AI Studio, always use the environment variable key.
    // On the web, use the key provided by the user.
    const keyToUse = isAiStudio() ? process.env.API_KEY! : apiKey;
  
    // If we have an instance and the key hasn't changed, reuse it.
    if (ai && currentKey === keyToUse) {
      return ai;
    }
  
    if (!keyToUse) {
      throw new Error("API Key is not provided or configured.");
    }
  
    // Create a new instance if the key has changed or it's the first time.
    ai = new GoogleGenAI({ apiKey: keyToUse });
    currentKey = keyToUse;
    return ai;
};


/**
 * Validates a Gemini API key by making a minimal, low-cost call.
 * Throws an error if the key is invalid or the request fails.
 * @param {string} apiKey The API key to validate.
 */
export const validateApiKey = async (apiKey: string): Promise<void> => {
  if (!apiKey || apiKey.trim() === '') {
    throw new Error("API Key không được để trống.");
  }
  
  // Do not use the cached client. Create a new one with the key to be tested.
  const validationClient = new GoogleGenAI({ apiKey });

  try {
    // Perform a simple, low-cost query to check if the key is valid.
    await validationClient.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: 'Validate',
        config: {
            thinkingConfig: { thinkingBudget: 0 }, // Disable thinking for faster validation
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
    // Generic error for network issues, etc.
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

async function executeAnalysis(apiKey: string, prompt: string, schema: any): Promise<{ data: any; usage: { totalTokens: number } }> {
    try {
        const geminiClient = getAiClient(apiKey);
        const response = await geminiClient.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: schema,
            },
        });
        const jsonText = response.text.trim();
        const usage = response.usageMetadata || { totalTokenCount: 0 };
        return {
            data: jsonText ? JSON.parse(jsonText) : null,
            usage: {
                totalTokens: usage.totalTokenCount || 0
            }
        };
    } catch (error) {
        console.error("Lỗi khi thực hiện phân tích:", error);
        if (error instanceof Error && error.message.includes('API key not valid')) {
            throw new Error("API Key không hợp lệ. Vui lòng kiểm tra lại trong mục cài đặt.");
        }
        throw error;
    }
}

export const analyzeChapterForPrimaryCharacter = async (apiKey: string, chapterContent: string, previousStats: CharacterStats | null): Promise<{ data: Partial<CharacterStats> | null, usage: { totalTokens: number }}> => {
    const taskPrompt = `**NHIỆM VỤ:**\nĐọc nội dung **CHƯƠNG MỚI** và chỉ trích xuất những thông tin **MỚI** hoặc **THAY ĐỔI** liên quan đến **TRẠNG THÁI CỦA NHÂN VẬT CHÍNH** (tên, cảnh giới, cấp độ, vật phẩm, công pháp, trang bị, tư chất).`;
    const fullPrompt = BASE_PROMPT
        .replace('{previousStats}', JSON.stringify(previousStats ?? {}, null, 2))
        .replace('**NHIỆM VỤ:**', taskPrompt)
        .replace('{chapterContent}', chapterContent.substring(0, 15000));
    return executeAnalysis(apiKey, fullPrompt, primaryCharacterSchema);
};

export const analyzeChapterForWorldInfo = async (apiKey: string, chapterContent: string, previousStats: CharacterStats | null): Promise<{ data: Partial<CharacterStats> | null, usage: { totalTokens: number }}> => {
    const taskPrompt = `**NHIỆM VỤ:**\nĐọc nội dung **CHƯƠNG MỚI** và chỉ trích xuất những thông tin **MỚI** hoặc **THAY ĐỔI** liên quan đến **THẾ GIỚI TRUYỆN** (nhân vật phụ, thế lực, địa điểm, vị trí hiện tại của nhân vật chính).`;
    const fullPrompt = BASE_PROMPT
        .replace('{previousStats}', JSON.stringify(previousStats ?? {}, null, 2))
        .replace('**NHIỆM VỤ:**', taskPrompt)
        .replace('{chapterContent}', chapterContent.substring(0, 15000));
    return executeAnalysis(apiKey, fullPrompt, worldInfoSchema);
};

export const analyzeChapterForCharacterStats = async (apiKey: string, chapterContent: string, previousStats: CharacterStats | null): Promise<{ data: CharacterStats | null, usage: { totalTokens: number }}> => {
    const taskPrompt = `**NHIỆM VỤ:**\nĐọc nội dung **CHƯƠNG MỚI** và chỉ trích xuất những thông tin **MỚI** hoặc **THAY ĐỔI** so với "DỮ LIỆU HIỆN TẠI".`;
     const fullPrompt = BASE_PROMPT
        .replace('{previousStats}', JSON.stringify(previousStats ?? {}, null, 2))
        .replace('**NHIỆM VỤ:**', taskPrompt)
        .replace('{chapterContent}', chapterContent.substring(0, 15000));
        
    const { data: stats, usage } = await executeAnalysis(apiKey, fullPrompt, characterStatsSchema);
    
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


/**
 * Trò chuyện với AI về nội dung của một chương cụ thể.
 * @param apiKey API Key của người dùng.
 * @param prompt Câu hỏi của người dùng.
 * @param chapterContent Nội dung văn bản của chương hiện tại.
 * @param storyTitle Tiêu đề của truyện để cung cấp ngữ cảnh.
 * @returns Câu trả lời từ AI.
 */
export const chatWithChapterContent = async (apiKey: string, prompt: string, chapterContent: string, storyTitle: string): Promise<{ text: string, usage: { totalTokens: number }}> => {
  try {
    const geminiClient = getAiClient(apiKey);
    const response = await geminiClient.models.generateContent({
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
    const usage = response.usageMetadata || { totalTokenCount: 0 };
    return {
      text: response.text,
      usage: {
        totalTokens: usage.totalTokenCount || 0
      }
    };
  } catch (error) {
    console.error("Lỗi khi trò chuyện về nội dung chương:", error);
    if (error instanceof Error && error.message.includes('API key not valid')) {
        throw new Error("API Key không hợp lệ. Vui lòng kiểm tra lại.");
    }
    throw new Error("Không thể nhận phản hồi từ AI. Vui lòng thử lại.");
  }
};


/**
 * Trò chuyện với AI về nội dung của toàn bộ Ebook.
 * Sử dụng quy trình hai bước: 1. Xác định các chương liên quan. 2. Trả lời câu hỏi dựa trên nội dung các chương đó.
 * @param apiKey API Key của người dùng.
 * @param prompt Câu hỏi của người dùng.
 * @param zipInstance Instance JSZip của file Ebook.
 * @param chapterList Danh sách các chương trong Ebook.
 * @returns Câu trả lời từ AI.
 */
export const chatWithEbook = async (apiKey: string, prompt: string, zipInstance: any, chapterList: Chapter[]): Promise<{ text: string, usage: { totalTokens: number }}> => {
  const geminiClient = getAiClient(apiKey);
  try {
    // === BƯỚC 1: Xác định các chương có liên quan ===
    const chapterListText = chapterList.map((c, i) => `${i + 1}. Tiêu đề: "${c.title}", Tên file: "${c.url}"`).join('\n');
    
    const chapterSelectionResponse = await geminiClient.models.generateContent({
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

    const relevantFilesData = JSON.parse(chapterSelectionResponse.text) as { relevant_files: string[] };
    const relevantFiles = relevantFilesData.relevant_files;

    if (!relevantFiles || relevantFiles.length === 0) {
      return { 
        text: "Tôi không tìm thấy chương nào có vẻ liên quan đến câu hỏi của bạn trong Ebook này.",
        usage: { totalTokens: chapterSelectionResponse.usageMetadata?.totalTokenCount || 0 }
      };
    }

    // === BƯỚC 2: Trích xuất nội dung và trả lời câu hỏi ===
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
        usage: { totalTokens: chapterSelectionResponse.usageMetadata?.totalTokenCount || 0 }
      };
    }

    const finalAnswerResponse = await geminiClient.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `**Nhiệm vụ:** Trả lời câu hỏi của người dùng một cách ngắn gọn và súc tích, chỉ dựa vào nội dung được cung cấp dưới đây. Nếu câu trả lời không có trong văn bản, hãy nói rằng bạn không tìm thấy thông tin trong đoạn trích này.
        
        **Nội dung được cung cấp:**
        ${contextContent.substring(0, 20000)}

        **Câu hỏi của người dùng:** "${prompt}"

        **Câu trả lời của bạn:**`,
    });
    
    const usage1 = chapterSelectionResponse.usageMetadata || { totalTokenCount: 0 };
    const usage2 = finalAnswerResponse.usageMetadata || { totalTokenCount: 0 };

    return {
      text: finalAnswerResponse.text,
      usage: {
        totalTokens: (usage1.totalTokenCount || 0) + (usage2.totalTokenCount || 0)
      }
    };

  } catch (error) {
    console.error("Lỗi khi trò chuyện về Ebook:", error);
    if (error instanceof Error && error.message.includes('API key not valid')) {
        throw new Error("API Key không hợp lệ. Vui lòng kiểm tra lại.");
    }
    throw new Error("Không thể nhận phản hồi từ AI. Vui lòng thử lại.");
  }
};

/**
 * Viết lại nội dung chương truyện cho dễ hiểu hơn.
 * @param apiKey API Key của người dùng.
 * @param content Nội dung chương gốc.
 * @returns Nội dung đã được viết lại.
 */
export const rewriteChapterContent = async (apiKey: string, content: string): Promise<{ text: string, usage: { totalTokens: number } }> => {
    try {
        const geminiClient = getAiClient(apiKey);
        // Prompt được thiết kế đặc biệt để xử lý văn phong convert/dịch máy
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

        const response = await geminiClient.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
        });

        const usage = response.usageMetadata || { totalTokenCount: 0 };
        return {
            text: response.text,
            usage: {
                totalTokens: usage.totalTokenCount || 0
            }
        };

    } catch (error) {
        console.error("Lỗi khi viết lại chương:", error);
        if (error instanceof Error && error.message.includes('API key not valid')) {
            throw new Error("API Key không hợp lệ. Vui lòng kiểm tra lại.");
        }
        throw new Error("Không thể thực hiện viết lại nội dung. Vui lòng thử lại.");
    }
};
