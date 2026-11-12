export interface CleanableContact {
  id: string;
  name: string;
  phone: string;
  type: 'duplicate_number' | 'duplicate_name' | 'empty';
  duplicateWith?: string;
}

export interface ContactsScanResult {
  duplicateNumbers: CleanableContact[];
  duplicateNames: CleanableContact[];
  emptyContacts: CleanableContact[];
  totalDuplicatesCount: number;
  hasPermission: boolean;
  isNativeModuleAvailable: boolean;
}

let deletedIds = new Set<string>();

/**
 * Safely resolve ExpoContacts native module without crashing at import time
 */
function getContactsModule(): any {
  try {
    const mod = require('expo-contacts/legacy');
    if (mod && (mod.getContactsAsync || mod.default?.getContactsAsync)) {
      return mod.default || mod;
    }
  } catch (err) {
    console.warn('ExpoContacts native module not linked yet:', err);
  }
  return null;
}

/**
 * Scan device contacts for duplicates and empty entries
 */
export async function scanDeviceContacts(): Promise<ContactsScanResult> {
  try {
    const Contacts = getContactsModule();

    if (!Contacts) {
      // Native module not linked in current APK build yet
      return {
        duplicateNumbers: [],
        duplicateNames: [],
        emptyContacts: [],
        totalDuplicatesCount: 0,
        hasPermission: false,
        isNativeModuleAvailable: false,
      };
    }

    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') {
      return {
        duplicateNumbers: [],
        duplicateNames: [],
        emptyContacts: [],
        totalDuplicatesCount: 0,
        hasPermission: false,
        isNativeModuleAvailable: true,
      };
    }

    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
    });

    const numberMap = new Map<string, any[]>();
    const nameMap = new Map<string, any[]>();
    const emptyList: CleanableContact[] = [];

    for (const contact of data || []) {
      if (deletedIds.has(contact.id)) continue;

      const phone = contact.phoneNumbers?.[0]?.number?.replace(/[\s\-\(\)\+]/g, '') || '';
      const rawPhone = contact.phoneNumbers?.[0]?.number || '';
      const name = contact.name?.trim() || '';

      if (!name || !phone) {
        emptyList.push({
          id: contact.id,
          name: name || 'İsimsiz Kayıt',
          phone: rawPhone || 'Numara Yok',
          type: 'empty',
        });
        continue;
      }

      if (phone) {
        const list = numberMap.get(phone) || [];
        list.push({ ...contact, formattedPhone: rawPhone });
        numberMap.set(phone, list);
      }

      if (name) {
        const list = nameMap.get(name.toLowerCase()) || [];
        list.push({ ...contact, formattedPhone: rawPhone });
        nameMap.set(name.toLowerCase(), list);
      }
    }

    const duplicateNumbers: CleanableContact[] = [];
    numberMap.forEach((contacts, num) => {
      if (contacts.length > 1) {
        contacts.slice(1).forEach((c) => {
          duplicateNumbers.push({
            id: c.id,
            name: c.name || 'İsimsiz',
            phone: c.formattedPhone || num,
            type: 'duplicate_number',
            duplicateWith: contacts[0]?.name,
          });
        });
      }
    });

    const duplicateNames: CleanableContact[] = [];
    nameMap.forEach((contacts, name) => {
      if (contacts.length > 1) {
        contacts.slice(1).forEach((c) => {
          duplicateNames.push({
            id: c.id,
            name: c.name || name,
            phone: c.formattedPhone || '',
            type: 'duplicate_name',
            duplicateWith: contacts[0]?.formattedPhone,
          });
        });
      }
    });

    return {
      duplicateNumbers,
      duplicateNames,
      emptyContacts: emptyList,
      totalDuplicatesCount: duplicateNumbers.length + duplicateNames.length + emptyList.length,
      hasPermission: true,
      isNativeModuleAvailable: true,
    };
  } catch (err) {
    console.error('Error scanning device contacts:', err);
    return {
      duplicateNumbers: [],
      duplicateNames: [],
      emptyContacts: [],
      totalDuplicatesCount: 0,
      hasPermission: false,
      isNativeModuleAvailable: false,
    };
  }
}

/**
 * Delete chosen contacts from device.
 *
 * Resolves true only when every contact was really removed. A contact that
 * fails to delete is not remembered as deleted, so it shows up again on the
 * next scan instead of silently vanishing from the list while still on the phone.
 */
export async function deleteChosenContacts(contactIds: string[]): Promise<boolean> {
  const Contacts = getContactsModule();
  if (!Contacts || !Contacts.removeContactAsync) return false;

  let allDeleted = true;
  for (const id of contactIds) {
    try {
      await Contacts.removeContactAsync(id);
      deletedIds.add(id);
      while (deletedIds.size > 5000) {
        deletedIds.delete(deletedIds.values().next().value as string);
      }
    } catch (e) {
      allDeleted = false;
      console.warn(`Failed deleting contact ${id}:`, e);
    }
  }
  return allDeleted;
}
