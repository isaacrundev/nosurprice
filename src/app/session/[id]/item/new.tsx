import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';

import { useStore } from '@/store';
import { parsePrice } from '@/types';
import { pickFromLibrary } from '@/utils/pickPhoto';
import { persistPhoto } from '@/utils/photoStorage';
import { confirmDestructive, showAlert } from '@/utils/dialog';
import { ocrPrice } from '@/utils/ocr';
import { PhotoGrid } from '@/components/PhotoGrid';
import { PhotoViewer } from '@/components/PhotoViewer';

type FormValues = {
  name: string;
  price: string;
  note: string;
};

const EMPTY: FormValues = { name: '', price: '', note: '' };

type Target = 'label' | 'extra';
type Step = 'label' | 'form';

export default function ItemNewScreen() {
  const { id: sessionId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const addItem = useStore((s) => s.addItem);

  const { control, handleSubmit, setValue } = useForm<FormValues>({
    defaultValues: EMPTY,
  });

  // 兩步驟流程:先上傳標籤照(label)才能進表單(form)。
  // 上傳 ≥1 張後才顯示「下一步」按鈕,使用者可一次傳多張再手動推進。
  const [step, setStep] = useState<Step>('label');
  const [labelPhotos, setLabelPhotos] = useState<string[]>([]);
  const [extraPhotos, setExtraPhotos] = useState<string[]>([]);
  // 正在挑 / 儲存中的 section;null 表示閒置。驅動 PhotoGrid 顯示 spinner
  const [pickingFor, setPickingFor] = useState<Target | null>(null);
  const [isOcring, setIsOcring] = useState(false);
  // 點縮圖 → 全螢幕檢視;null = 關閉
  const [viewerUri, setViewerUri] = useState<string | null>(null);

  const handleCapture = useCallback(async (target: Target) => {
    // 開 picker 不用 spinner(同步動作);spinner 只覆蓋 persistPhoto 那段
    const rawUri = await pickFromLibrary();
    if (!rawUri) return;
    setPickingFor(target);
    try {
      // web blob URI 直接用(native 走 documentDirectory 持久化)
      const uri = Platform.OS === 'web' ? rawUri : await persistPhoto(rawUri);
      if (target === 'label') {
        setLabelPhotos((prev) => [...prev, uri]);
      } else {
        setExtraPhotos((prev) => [...prev, uri]);
      }
    } catch {
      showAlert('錯誤', '照片儲存失敗');
    } finally {
      setPickingFor(null);
    }
  }, []);

  const handleRemove = useCallback(async (target: Target, idx: number) => {
    const ok = await confirmDestructive('刪除照片', '確定刪除這張?');
    if (!ok) return;
    if (target === 'label') {
      setLabelPhotos((prev) => prev.filter((_, i) => i !== idx));
    } else {
      setExtraPhotos((prev) => prev.filter((_, i) => i !== idx));
    }
  }, []);

  const canContinue = labelPhotos.length >= 1;
  const canSave = labelPhotos.length >= 1;

  const handleOcr = useCallback(async () => {
    if (labelPhotos.length === 0) {
      showAlert('需要標籤照', '請先拍或選一張標籤照才能辨識價格');
      return;
    }
    setIsOcring(true);
    try {
      const price = await ocrPrice(labelPhotos[0]);
      if (price === null) {
        showAlert('辨識失敗', '從這張圖找不到明顯的價格,請手動輸入');
        return;
      }
      setValue('price', String(price));
      showAlert('辨識完成', `帶入價格 ${price} 元,請檢查是否正確`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '未知錯誤';
      showAlert('OCR 錯誤', msg);
    } finally {
      setIsOcring(false);
    }
  }, [labelPhotos, setValue]);

  const onSave = handleSubmit(async (data) => {
    const name = data.name.trim();
    if (!name) {
      showAlert('請輸入商品名稱');
      return;
    }
    const priceText = data.price.trim();
    let expectedPrice: number | undefined;
    if (priceText) {
      const parsed = parsePrice(priceText);
      if (parsed === null) {
        showAlert('價格格式不對', '請輸入正整數,例如 199 或 NT$199');
        return;
      }
      expectedPrice = parsed;
    }
    const note = data.note.trim() || undefined;

    await addItem({
      sessionId,
      name,
      expectedPrice,
      labelPhotos,
      extraPhotos,
      note,
    });
    router.back();
  });

  // 第 1 步:上傳標籤照。沒標籤不能進表單。
  if (step === 'label') {
    return (
      <SafeAreaView style={styles.container}>
        <PhotoViewer uri={viewerUri} onClose={() => setViewerUri(null)} />
        <Stack.Screen options={{ title: '新增商品' }} />
        <View style={styles.stepIntro}>
          <Text style={styles.stepKicker}>第 1 步 / 共 2 步</Text>
          <Text style={styles.stepTitle}>先拍標籤照</Text>
          <Text style={styles.stepDesc}>
            標籤照是辨識價格、留下紀錄的依據。請先拍或選至少 1 張再填其他資料。
          </Text>
        </View>
        <View style={styles.labelGridWrap}>
          <PhotoGrid
            photos={labelPhotos}
            onAdd={() => handleCapture('label')}
            onRemove={(idx) => handleRemove('label', idx)}
            onPress={setViewerUri}
            loading={pickingFor === 'label'}
          />
        </View>
        <View style={styles.footer}>
          {canContinue && (
            <Pressable
              onPress={() => setStep('form')}
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && styles.primaryBtnPressed,
              ]}
            >
              <Text style={styles.primaryBtnText}>下一步</Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // 第 2 步:填寫表單(沿用既有 layout)。
  return (
    <SafeAreaView style={styles.container}>
      <PhotoViewer uri={viewerUri} onClose={() => setViewerUri(null)} />
      <Stack.Screen options={{ title: '新增商品' }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kav}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <Field label="商品名稱" required>
            <Controller
              control={control}
              name="name"
              render={({ field }) => (
                <TextInput
                  style={styles.input}
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  placeholder="例:御飯糰 鮭魚"
                  placeholderTextColor="#a0a0a0"
                  returnKeyType="next"
                />
              )}
            />
          </Field>

          <Field label="看到的價格 (NTD)">
            <Controller
              control={control}
              name="price"
              render={({ field }) => (
                <TextInput
                  style={styles.input}
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  placeholder="199"
                  placeholderTextColor="#a0a0a0"
                  keyboardType="number-pad"
                />
              )}
            />
            {labelPhotos.length > 0 && (
              <Pressable
                onPress={handleOcr}
                disabled={isOcring}
                style={({ pressed }) => [
                  styles.ocrBtn,
                  pressed && styles.ocrBtnPressed,
                  isOcring && styles.ocrBtnDisabled,
                ]}
              >
                {isOcring ? (
                  <View style={styles.ocrBtnRow}>
                    <ActivityIndicator size="small" />
                    <Text style={styles.ocrBtnText}>辨識中...</Text>
                  </View>
                ) : (
                  <Text style={styles.ocrBtnText}>📷 從標籤照辨識價格</Text>
                )}
              </Pressable>
            )}
          </Field>

          <Field label="備註 (選填)">
            <Controller
              control={control}
              name="note"
              render={({ field }) => (
                <TextInput
                  style={[styles.input, styles.multiline]}
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  placeholder="例:第二件 5 折 / 限今日"
                  placeholderTextColor="#a0a0a0"
                  multiline
                />
              )}
            />
          </Field>

          <View style={styles.photoSection}>
            <Text style={styles.photoLabel}>
              標籤照 <Text style={styles.required}>*</Text>
              <Text style={styles.photoHint}> 至少 1 張,§8.1 擋存</Text>
            </Text>
            <PhotoGrid
              photos={labelPhotos}
              onAdd={() => handleCapture('label')}
              onRemove={(idx) => handleRemove('label', idx)}
              onPress={setViewerUri}
              loading={pickingFor === 'label'}
            />
          </View>

          <View style={styles.photoSection}>
            <Text style={styles.photoLabel}>其他照片 (選填)</Text>
            <PhotoGrid
              photos={extraPhotos}
              onAdd={() => handleCapture('extra')}
              onRemove={(idx) => handleRemove('extra', idx)}
              onPress={setViewerUri}
              loading={pickingFor === 'extra'}
            />
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            onPress={onSave}
            disabled={!canSave}
            style={({ pressed }) => [
              styles.primaryBtn,
              !canSave && styles.primaryBtnDisabled,
              pressed && canSave && styles.primaryBtnPressed,
            ]}
          >
            <Text style={styles.primaryBtnText}>
              {canSave ? '儲存' : '需先拍標籤照'}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  kav: { flex: 1 },

  // step 1 排版
  stepIntro: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 8, gap: 6 },
  stepKicker: { fontSize: 12, color: '#208AEF', fontWeight: '600', letterSpacing: 0.5 },
  stepTitle: { fontSize: 22, fontWeight: '700', color: '#222' },
  stepDesc: { fontSize: 14, color: '#555', lineHeight: 20 },
  // flex:1 把 footer 壓到底,符合「Bottom button」PRD 語意
  labelGridWrap: { flex: 1, paddingHorizontal: 20, paddingTop: 12 },

  // step 2 表單排版
  content: { padding: 16, gap: 16 },
  field: { gap: 6 },
  label: { fontSize: 13, color: '#444', fontWeight: '500' },
  required: { color: '#c00' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  photoSection: { gap: 8, marginTop: 8 },
  photoLabel: { fontSize: 13, color: '#444', fontWeight: '500' },
  photoHint: { fontSize: 11, color: '#888', fontWeight: '400' },

  // 共用 footer + primary button(step 1「繼續填寫」、step 2「儲存」共用)
  footer: {
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ccc',
    backgroundColor: '#fff',
  },
  primaryBtn: {
    backgroundColor: '#208AEF',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnPressed: { opacity: 0.7 },
  primaryBtnDisabled: { backgroundColor: '#aaa' },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  ocrBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#208AEF',
    backgroundColor: '#f0f7ff',
    marginTop: 4,
  },
  ocrBtnPressed: { opacity: 0.6 },
  ocrBtnDisabled: { opacity: 0.5 },
  ocrBtnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ocrBtnText: { color: '#208AEF', fontSize: 14, fontWeight: '600' },
});
