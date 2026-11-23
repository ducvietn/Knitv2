/**
 * Tầng 1 — Chuẩn hoá ý định & tách khái niệm.
 *
 * Biến một câu hỏi bất kỳ của sinh viên thành khái niệm chuẩn của ULIS
 * kèm từ khoá mở rộng, để tầng bên dưới tìm được bài viết dù cách diễn
 * đạt hoàn toàn khác.
 */

import { callLlmJson } from './llm'

/** Schema JSON cho tầng 1. */
const NORMALISE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    intent: { type: 'string' },
    concept: { type: 'string' },
    concepts: { type: 'array', items: { type: 'string' } },
    keywords: { type: 'array', items: { type: 'string' } },
    entities: { type: 'array', items: { type: 'string' } },
    isProcedural: { type: 'boolean' },
  },
  required: ['intent', 'concept', 'concepts', 'keywords', 'entities', 'isProcedural'],
} as const

const NORMALISE_SYSTEM = [
  'Ban la bo chuan hoa y do cho tro ly dieu huong cua dien dan KNIT (Dai hoc Quoc gia TP.HCM, khoa Ngu ngu, Van hoa Phap - ULIS).',
  '',
  'NHIEM VU: tu cau hoi cua sinh vien, tach ra y do chuan, khai niem chuan cua ULIS va bo tu khoa mo rong.',
  '',
  'QUY TAC:',
  '1. Y do (intent): mo ta ngan gon sinh vien muon lam gi. Vi du: "Hoc lai, tinh hoc phi tinh chi, quy che diem F".',
  '2. Khai niem chuan (concept): cum thuat ngu chinh thuc cua truong ma sinh vien se dung khi dang bai. Vi du: "Hoc lai - hoc phi - quy che diem F".',
  '3. concepts: 1-3 khai niem chuan lien quan.',
  '4. keywords: 6-12 tu khoa mo rong. BAO GOM BAT BUOC:',
  '   - Tu tieng Viet CO dau.',
  '   - Tu tieng Viet KHONG dau.',
  '   - Tu tieng Anh tuong duong.',
  '   Vi du: ["hoc lai", "hoc lai mon", "diem F", "hoc phi", "tinh chi", "cai thien diem", "retake", "tuition"]',
  '5. entities: cac thuoc tinh cu the co trong cau hoi (khoa, nganh, nam hoc, khoi, mon hoc). Neu khong co thi tra ve mang rong.',
  '6. isProcedural: true neu cau hoi hoi ve QUY TRINH (lam gi, xin gi, lam the nao, o dau).',
  '',
  'TU DIEN KHAI NIEM CHINH THUC CUA ULIS — dung de quy chuan hoa ve dung thuat ngu ma sinh vien se dung khi dang bai:',
  '- "ma sinh vien" / "MSV" / "student ID" / "student number" => "THE SINH VIEN" (the da nang cua DHQGHN, co chuc nang the ngan hang).',
  '- "lam the" / "cap the" / "student card" => "LAM THE SINH VIEN".',
  '- "giay xac nhan" / "giay to" / "chung minh" / "certificate of enrollment" => "GIAY XAC NHAN SINH VIEN".',
  '- "nghia vu quan su" / "hoan nghia vu" / "mien nghia vu" / "de nghia vu" / "military deferment" => "NGHIA VU QUAN SU".',
  '- "hoc lai" / "retake" / "thi lai" => "HOC LAI - THI LAI MON HOC".',
  '- "diem F" / "rot mon" / "diem 0" => "QUY CHE DIEM - HOC LAI MON TRUOT".',
  '- "hoc phi" / "dong hoc phi" / "tuition" => "HOC PHI - MIEN GIAM HOC PHI".',
  '- "dang ky hoc phan" / "dang ky mon" / "register" => "DANG KY HOC PHAN".',
  '- "bao hiem" / "bhyt" / "y te" / "insurance" => "BAO HIEM Y TE".',
  '- "ho chieu" / "passport" => "HO CHIEU - LAM HO CHIEU".',
  '- "hoc bong" / "scholarship" => "HOC BONG".',
  '- "ky tuc" / "noi tru" / "dormitory" => "KY TUC XA".',
  '- "thu vien" / "muon sach" / "library" => "THU VIEN - MUON SACH".',
  '- "thuc tap" / "internship" => "THUC TAP - THUC TAP NGOH VU".',
  '- "tot nghiep" / "graduation" => "TOT NGHIEP - THI TOT NGHIEP".',
  '',
  'CAU HOI CO THE VIET KHONG DAU, CO DAU, HOAC TIENG ANH — ca ba deu phai ra cung mot khái niem chuan.',
  '',
  'LUU Y: khai niem chuan phai dung THUAT NGU CHINH THUC (nhu trong bang tu dien o tren), khong dung tu nghia tu hien tai cua nguoi hoi. Vi du cau hoi "lay ma sinh vien" co khai niem chuan la "THE SINH VIEN", con cau hoi "chung minh hanh khach" co khai niem chuan la "GIAY TO".',
].join('\n')

/** Kết quả chuẩn hoá ý định. */
export interface NormalisedIntent {
  /** Ý định gốc của sinh viên. */
  intent: string
  /** Khái niệm chuẩn của ULIS. */
  concept: string
  /** Danh sách khái niệm chuẩn liên quan. */
  concepts: string[]
  /** Từ khoá mở rộng (đa ngôn ngữ). */
  keywords: string[]
  /** Thuộc tính cụ thể trong câu hỏi. */
  entities: string[]
  /** Câu hỏi có phải về quy trình không. */
  isProcedural: boolean
}

/** Cache kết quả chuẩn hoá. */
const cache = new Map<string, NormalisedIntent>()

/** Số mục giữ trong cache. */
const CACHE_LIMIT = 200

/**
 * Chuẩn hoá câu hỏi của sinh viên.
 *
 * Tra ve `null` neu model loi — caller tiep tuc voi cau hoi goc.
 */
export const normaliseIntent = async (question: string): Promise<NormalisedIntent | null> => {
  const key = question.trim().toLowerCase()
  const cached = cache.get(key)
  if (cached) return cached

  const result = await callLlmJson({
    name: 'intent_normalise',
    schema: NORMALISE_SCHEMA as unknown as Record<string, unknown>,
    system: NORMALISE_SYSTEM,
    user: `Cau hoi cua sinh vien: ${question}`,
  })

  const payload = result?.data as Partial<NormalisedIntent> | undefined
  if (!payload?.intent) return null

  const keywords = Array.isArray(payload.keywords)
    ? payload.keywords.map((k) => String(k).trim()).filter(Boolean)
    : []

  const normalised: NormalisedIntent = {
    intent: String(payload.intent),
    concept: String(payload.concept ?? payload.intent),
    concepts: Array.isArray(payload.concepts)
      ? payload.concepts.map((c) => String(c).trim()).filter(Boolean)
      : [],
    keywords,
    entities: Array.isArray(payload.entities)
      ? payload.entities.map((e) => String(e).trim()).filter(Boolean)
      : [],
    isProcedural: Boolean(payload.isProcedural),
  }

  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
  cache.set(key, normalised)

  return normalised
}
