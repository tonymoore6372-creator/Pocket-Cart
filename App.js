import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, Modal, StyleSheet,
  ScrollView, BackHandler, Platform, SafeAreaView, Alert,
} from 'react-native';
import * as SQLite from 'expo-sqlite';

/* ---------- Database ---------- */
const db = SQLite.openDatabaseSync('shopping.db');
db.execSync(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    closed INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    price REAL NOT NULL,
    quantity INTEGER NOT NULL
  );
`);

const repo = {
  currentSession() {
    const row = db.getFirstSync('SELECT id FROM sessions WHERE closed = 0 ORDER BY id DESC LIMIT 1');
    if (row) return row.id;
    return db.runSync('INSERT INTO sessions (closed) VALUES (0)').lastInsertRowId;
  },
  items(sid) {
    return db.getAllSync('SELECT id, price, quantity FROM items WHERE session_id = ? ORDER BY id', [sid]);
  },
  total(sid) {
    const r = db.getFirstSync('SELECT COALESCE(SUM(price * quantity), 0) AS t FROM items WHERE session_id = ?', [sid]);
    return r.t;
  },
  add(sid, price, qty) {
    const same = db.getFirstSync('SELECT id FROM items WHERE session_id = ? AND price = ?', [sid, price]);
    if (same) db.runSync('UPDATE items SET quantity = quantity + ? WHERE id = ?', [qty, same.id]);
    else db.runSync('INSERT INTO items (session_id, price, quantity) VALUES (?, ?, ?)', [sid, price, qty]);
  },
  remove(id, qty) {
    const row = db.getFirstSync('SELECT quantity FROM items WHERE id = ?', [id]);
    if (!row) return;
    if (qty >= row.quantity) db.runSync('DELETE FROM items WHERE id = ?', [id]);
    else db.runSync('UPDATE items SET quantity = quantity - ? WHERE id = ?', [qty, id]);
  },
  startNew(sid) {
    const n = db.getFirstSync('SELECT COUNT(*) AS n FROM items WHERE session_id = ?', [sid]).n;
    if (n > 0) db.runSync('UPDATE sessions SET closed = 1 WHERE id = ?', [sid]);
    else db.runSync('DELETE FROM items WHERE session_id = ?', [sid]);
    return repo.currentSession();
  },
  lastHistory() {
    const s = db.getFirstSync('SELECT id FROM sessions WHERE closed = 1 ORDER BY id DESC LIMIT 1');
    if (!s) return { items: [], total: 0 };
    return { items: repo.items(s.id), total: repo.total(s.id) };
  },
};

/* ---------- Helpers ---------- */
const C = { green: '#99CC00', dark: '#2E7D32', orange: '#E07B39', yellow: '#FFE000', blue: '#00A8E8' };
const money = (n) => '$' + (Math.round(n * 100) / 100).toFixed(2);
const KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', 'C'];

/* ---------- App ---------- */
export default function App() {
  const [sid, setSid] = useState(null);
  const [screen, setScreen] = useState('calc'); // calc | remove | history
  const [menu, setMenu] = useState(false);
  const [input, setInput] = useState('');
  const [qty, setQty] = useState('1');
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [target, setTarget] = useState(null); // item being removed
  const [delQty, setDelQty] = useState('1');
  const [history, setHistory] = useState({ items: [], total: 0 });

  const refresh = useCallback((id) => {
    setItems(repo.items(id));
    setTotal(repo.total(id));
  }, []);

  useEffect(() => {
    const id = repo.currentSession();
    setSid(id);
    refresh(id);
  }, [refresh]);

  const press = (k) => {
    if (k === 'C') return setInput('');
    if (k === '.' && input.includes('.')) return;
    const dec = input.split('.')[1];
    if (dec && dec.length >= 2) return;
    if (input.length >= 9) return;
    setInput(k === '.' && !input ? '0.' : input + k);
  };

  const addToCart = () => {
    const price = parseFloat(input);
    const q = parseInt(qty, 10);
    if (!(price > 0)) return Alert.alert('Enter a price', 'Type the item price before adding it.');
    if (!(q > 0)) return Alert.alert('Check quantity', 'Quantity must be 1 or more.');
    repo.add(sid, price, q);
    setInput('');
    setQty('1');
    refresh(sid);
  };

  const openRemove = (item) => {
    setTarget(item);
    setDelQty(String(item.quantity));
  };

  const confirmDelete = () => {
    const q = parseInt(delQty, 10);
    if (q > 0) repo.remove(target.id, q);
    setTarget(null);
    refresh(sid);
  };

  const go = (name) => {
    setMenu(false);
    if (name === 'new') {
      const id = repo.startNew(sid);
      setSid(id);
      refresh(id);
      setInput('');
      setQty('1');
      setScreen('calc');
    } else if (name === 'history') {
      setHistory(repo.lastHistory());
      setScreen('history');
    } else if (name === 'exit') {
      if (Platform.OS === 'android') BackHandler.exitApp();
      else setScreen('calc');
    }
  };

  if (sid === null) return null;

  return (
    <SafeAreaView style={s.root}>
      <View style={s.phone}>
        {/* Top bar */}
        <View style={s.topRow}>
          <TouchableOpacity style={s.burger} onPress={() => setMenu(!menu)}>
            {[0, 1, 2].map((i) => <View key={i} style={s.burgerLine} />)}
          </TouchableOpacity>
          <View style={s.title}>
            <Text style={s.titleText}>
              {screen === 'calc' ? 'Pocket Cart' : screen === 'remove' ? 'Remove a product' : 'Last Shopping History'}
            </Text>
          </View>
        </View>

        {/* Menu */}
        {menu && (
          <View style={s.menu}>
            <TouchableOpacity onPress={() => go('new')}><Text style={s.menuText}>New</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => go('history')}><Text style={s.menuText}>History</Text></TouchableOpacity>
            <View style={{ height: 40 }} />
            <TouchableOpacity onPress={() => go('exit')}><Text style={s.menuText}>Exit</Text></TouchableOpacity>
          </View>
        )}

        {/* Calculator */}
        {screen === 'calc' && (
          <View style={{ flex: 1 }}>
            <View style={s.display}>
              <Text style={s.displayText}>{input ? '$' + input : '$0.00'}</Text>
              <TouchableOpacity onPress={() => setInput(input.slice(0, -1))} style={s.back}>
                <Text style={{ fontSize: 26 }}>⬅</Text>
              </TouchableOpacity>
            </View>

            <View style={s.mid}>
              <View style={s.keypad}>
                <View style={s.keys}>
                  {KEYS.map((k) => (
                    <TouchableOpacity key={k} style={s.key} onPress={() => press(k)}>
                      <Text style={s.keyText}>{k}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={s.qtyRow}>
                  <View style={s.qtyLabel}><Text>Quantity</Text></View>
                  <TextInput
                    style={s.qtyInput}
                    value={qty}
                    keyboardType="number-pad"
                    onChangeText={(t) => setQty(t.replace(/[^0-9]/g, ''))}
                    maxLength={3}
                  />
                </View>
              </View>

              <View style={s.actions}>
                <TouchableOpacity style={[s.action, { backgroundColor: C.yellow }]} onPress={addToCart}>
                  <Text style={s.actionText}>Add To</Text>
                  <Text style={s.cart}>🛒</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.action, { backgroundColor: C.blue }]} onPress={() => setScreen('remove')}>
                  <Text style={s.actionText}>Remove From</Text>
                  <Text style={s.cart}>🛒</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={s.totalBar}><Text style={s.totalText}>Total:  {money(total)}</Text></View>
          </View>
        )}

        {/* Remove a product */}
        {screen === 'remove' && (
          <View style={{ flex: 1 }}>
            <ScrollView style={{ marginTop: 12 }}>
              <Row cells={['Price ($)', 'Quantity', 'Action']} head />
              {items.map((it) => (
                <Row
                  key={it.id}
                  cells={[it.price.toFixed(2), String(it.quantity), 'Remove']}
                  onAction={() => openRemove(it)}
                />
              ))}
              <Row cells={['Total:\n' + money(total), '', '']} />
            </ScrollView>
            <TouchableOpacity style={s.doneBtn} onPress={() => setScreen('calc')}>
              <Text style={s.actionText}>Done</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* History */}
        {screen === 'history' && (
          <ScrollView style={{ marginTop: 12 }}>
            <Row cells={['Price', 'Quantity']} head big />
            {history.items.map((it) => (
              <Row key={it.id} cells={[it.price.toFixed(2), String(it.quantity)]} />
            ))}
            <Row cells={['Total', money(history.total)]} big />
            <TouchableOpacity style={s.doneBtn} onPress={() => setScreen('calc')}>
              <Text style={s.actionText}>Back</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>

      {/* Quantity dialog */}
      <Modal transparent visible={!!target} animationType="fade" onRequestClose={() => setTarget(null)}>
        <View style={s.overlay}>
          <View style={s.dialog}>
            <Text style={s.dialogTitle}>Quantity</Text>
            <TextInput
              style={s.dialogInput}
              value={delQty}
              keyboardType="number-pad"
              onChangeText={(t) => setDelQty(t.replace(/[^0-9]/g, ''))}
            />
            <View style={s.dialogBtns}>
              <TouchableOpacity style={s.dialogBtn} onPress={() => setTarget(null)}>
                <Text style={s.actionText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.dialogBtn} onPress={confirmDelete}>
                <Text style={s.actionText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Row({ cells, head, big, onAction }) {
  const n = cells.length;
  return (
    <View style={s.tr}>
      {cells.map((c, i) => {
        const isAction = onAction && i === n - 1;
        const Cell = isAction ? TouchableOpacity : View;
        return (
          <Cell key={i} style={s.td} onPress={isAction ? onAction : undefined}>
            <Text style={[s.tdText, (head || big) && { fontSize: 18, fontWeight: '600' }]}>{c}</Text>
          </Cell>
        );
      })}
    </View>
  );
}

/* ---------- Styles ---------- */
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff', paddingTop: Platform.OS === 'android' ? 28 : 0 },
  phone: { flex: 1, backgroundColor: C.green, margin: 8, borderWidth: 2, borderColor: C.dark, padding: 8 },
  topRow: { flexDirection: 'row' },
  burger: { width: 46, height: 46, backgroundColor: '#fff', borderWidth: 1, borderColor: '#555', justifyContent: 'space-evenly', padding: 6 },
  burgerLine: { height: 1.5, backgroundColor: '#000' },
  title: { flex: 1, marginLeft: 6, backgroundColor: '#fff', borderWidth: 1, borderColor: '#555', justifyContent: 'center', alignItems: 'center' },
  titleText: { fontSize: 16 },
  menu: { position: 'absolute', top: 62, left: 8, zIndex: 10, backgroundColor: C.blue, borderWidth: 1, borderColor: '#555', padding: 10, minWidth: 110 },
  menuText: { fontSize: 17, paddingVertical: 6 },
  display: { marginTop: 10, height: 72, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#555', justifyContent: 'center', alignItems: 'center' },
  displayText: { fontSize: 24 },
  back: { position: 'absolute', right: 12 },
  mid: { flexDirection: 'row', marginTop: 10 },
  keypad: { flex: 1.5, backgroundColor: C.orange, borderRadius: 22, padding: 8 },
  keys: { flexDirection: 'row', flexWrap: 'wrap' },
  key: { width: '31.3%', margin: '1%', aspectRatio: 1, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#555', alignItems: 'center', justifyContent: 'center' },
  keyText: { fontSize: 26 },
  qtyRow: { flexDirection: 'row', marginTop: 6, height: 40 },
  qtyLabel: { flex: 2, backgroundColor: '#fff', borderWidth: 1, borderColor: '#555', justifyContent: 'center', alignItems: 'center', marginRight: 6 },
  qtyInput: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#555', textAlign: 'center', fontSize: 22, padding: 0 },
  actions: { flex: 1, marginLeft: 8 },
  action: { flex: 1, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 8, padding: 6 },
  actionText: { fontSize: 20, textAlign: 'center' },
  cart: { fontSize: 38, marginTop: 4 },
  totalBar: { marginTop: 10, height: 46, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#555', alignItems: 'center', justifyContent: 'center' },
  totalText: { fontSize: 18, fontWeight: '700' },
  tr: { flexDirection: 'row' },
  td: { flex: 1, minHeight: 52, borderWidth: 1, borderColor: '#000', alignItems: 'center', justifyContent: 'center', padding: 4 },
  tdText: { fontSize: 16, textAlign: 'center' },
  doneBtn: { marginTop: 14, backgroundColor: C.yellow, borderRadius: 12, padding: 12, alignItems: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  dialog: { width: 260, backgroundColor: C.blue, borderWidth: 1, borderColor: C.dark },
  dialogTitle: { fontSize: 30, fontWeight: '700', textAlign: 'center', marginTop: 6 },
  dialogInput: { alignSelf: 'center', width: 90, marginVertical: 10, backgroundColor: C.green, borderWidth: 1, borderColor: C.dark, textAlign: 'center', fontSize: 24, padding: 4 },
  dialogBtns: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  dialogBtn: { backgroundColor: C.yellow, padding: 12, minWidth: 100, alignItems: 'center', borderWidth: 1, borderColor: C.dark },
});
