/**
 * PDFに印鑑画像を重ねる
 * pdf-libを使用してPDFの1ページ目に印鑑画像を配置
 */
import { PDFDocument } from 'pdf-lib';

/**
 * PDFバッファに印鑑画像を重ねて返す
 * @param pdfBuffer 元のPDFバッファ
 * @param stampPngBase64 印鑑画像のBase64（data:image/png;base64,...）
 * @param x 右端からのオフセット（pt）
 * @param y 下端からのオフセット（pt）
 * @param size 印鑑サイズ（pt）
 */
export async function addStampToPdf(
  pdfBuffer: Buffer,
  stampPngBase64: string,
  x = 480,
  y = 620,
  size = 50,
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);

  // Base64からPNG画像データを抽出
  const base64Data = stampPngBase64.replace(/^data:image\/png;base64,/, '');
  const pngBytes = Buffer.from(base64Data, 'base64');
  const stampImage = await pdfDoc.embedPng(pngBytes);

  // 1ページ目に印鑑を配置
  const page = pdfDoc.getPage(0);
  page.drawImage(stampImage, {
    x,
    y,
    width: size,
    height: size,
  });

  const modifiedPdfBytes = await pdfDoc.save();
  return Buffer.from(modifiedPdfBytes);
}
