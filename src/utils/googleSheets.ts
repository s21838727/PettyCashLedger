import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import firebaseConfig from '@/firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/spreadsheets');
provider.addScope('https://www.googleapis.com/auth/drive.file');

let isSigningIn = false;
let cachedAccessToken: string | null = null;

export const initGoogleAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Firebase Auth');
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Google Sign-in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const exportToGoogleSheets = async (
  departmentName: string,
  custodian: string,
  transactions: Array<{
    date: string;
    voucherNo: string;
    invoiceNo?: string;
    description: string;
    category: string;
    spent: number;
    replenishment: number;
    balance: number;
    custodian: string;
    handler: string;
  }>,
  accessToken: string,
  targetSpreadsheetId?: string
): Promise<string> => {
  let spreadsheetId = targetSpreadsheetId?.trim();
  let spreadsheetUrl = '';

  if (spreadsheetId) {
    const match = spreadsheetId.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
      spreadsheetId = match[1];
    }
  }

  if (!spreadsheetId) {
    // 1. Create a new Google Sheet if not specified
    const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: `${departmentName}_零用金紀錄表_${new Date().toISOString().slice(0, 10)}`,
        },
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.json();
      throw new Error(err.error?.message || '無法建立 Google 試算表');
    }

    const sheetData = await createRes.json();
    spreadsheetId = sheetData.spreadsheetId;
    spreadsheetUrl = sheetData.spreadsheetUrl;
  } else {
    spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
  }

  // 2. Fetch spreadsheet metadata to get the actual first sheet title (e.g. 'Sheet1' or '工作表1')
  let sheetTitle = 'Sheet1';
  try {
    const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (metaRes.ok) {
      const metaData = await metaRes.json();
      if (metaData.sheets && metaData.sheets.length > 0 && metaData.sheets[0].properties?.title) {
        sheetTitle = metaData.sheets[0].properties.title;
      }
    } else {
      const errBody = await metaRes.json();
      throw new Error(errBody.error?.message || '無法讀取指定的 Google 試算表，請確認 ID 是否正確且該帳號擁有編輯權限');
    }
  } catch (e: any) {
    if (e.message && e.message.includes('無法讀取')) {
      throw e;
    }
  }

  // 3. Prepare values according to user columns:
  // 日期, 單據/發票號碼, 商家/摘要說明, 類別, 支出, 收入, 結餘, 經辦人, 資金經手人
  const rows = [
    [
      '日期',
      '單據/發票號碼',
      '商家/摘要說明',
      '類別',
      '支出',
      '收入',
      '結餘',
      '經辦人',
      '資金經手人'
    ],
    ...transactions.map(tx => [
      tx.date,
      `${tx.voucherNo}${tx.invoiceNo ? ` (發票:${tx.invoiceNo})` : ''}`,
      tx.description,
      tx.category,
      tx.spent > 0 ? tx.spent : '',
      tx.replenishment > 0 ? tx.replenishment : '',
      tx.balance,
      tx.custodian,
      tx.handler
    ])
  ];

  // 4. Write values to the sheet
  const updateRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetTitle)}!A1:I${rows.length}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: `${sheetTitle}!A1:I${rows.length}`,
        majorDimension: 'ROWS',
        values: rows,
      }),
    }
  );

  if (!updateRes.ok) {
    const err = await updateRes.json();
    throw new Error(err.error?.message || '無法寫入 Google 試算表。請確認您已登入正確的 Google 帳號且該帳號對此試算表具有「編輯者」權限。');
  }

  return spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
};
