// --- 1. CONFIGURACIÓN DE SERVICIOS (CPA ENTRE RÍOS) ---
const firebaseConfig = {
  apiKey: "AIzaSyD9QKcAOThJ60XBYtifMg6BZyvvxiPTRDs",
  authDomain: "demoarbitros.firebaseapp.com",
  projectId: "demoarbitros",
  storageBucket: "demoarbitros.firebasestorage.app",
  messagingSenderId: "567435315057",
  appId: "1:567435315057:web:539ea270a3c205f9ec18d0"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// --- 2. ESTADO GLOBAL ---
let state = {
    currentUser: null,
    userData: null,
    matches: [],
    availabilities: [],
    assignments: [],
    allUsers: [],
    exams: [],
    results: [],
    categoryPrices: {}, // Precios para árbitros
    categoryPricesPlanillero: {}, // Precios para planilleros
    systemSettings: { enabledDate: "" },
    view: 'home', // home, profile, admin_exams, admin_ranking, taking_exam, settlement
    currentExam: null,
    examProgress: { index: 0, answers: [], timeLeft: 45, timer: null },
    roles: ["1er Árbitro", "2do Árbitro", "Planillero", "Juez de Línea 1", "Juez de Línea 2"],
    categories: ["Sub 12 in (Torneo Oficial APV)","Sub 12 av (Torneo Oficial APV)","Sub 14 (Torneo Oficial APV)","Sub 18 Masculina","Sub 15 F PRO (Torneo Oficial APV)", "Sub 16 (Torneo Oficial APV)", "Sub 18 (Torneo Oficial APV)","Sub 18 F PRO (Torneo Oficial APV)", "Mayor (Torneo Oficial APV)", "Sub 14 (Liga Santafesina)","Sub 16 (Liga Santafesina)", "Sub 18 (Liga Santafesina)", "Sub 21 (Liga Santafesina)",  "Mayor (Liga Santafesina)","Mayores intermedia", "Maxi Vóley C", "Maxi Vóley"],
    branches: ["Femenino", "Masculino", "Mixto"],
    timeSlots: ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00", "23:00", "00:00"]
};

// --- 3. FUNCIONES AUXILIARES ---
    function obtenerNombreDia(fechaString) {
        if(!fechaString) return "";
        const dias = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
        const [year, month, day] = fechaString.split('-').map(Number);
        const fecha = new Date(year, month - 1, day);
        return dias[fecha.getDay()];
    }

    function obtenerFechaHoy() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    // --- RESET AUTOMÁTICO DISPONIBILIDAD (Sábado 00:00) ---
function initAvailabilityResetScheduler() {
    function scheduleNextCheck() {
        const now = new Date();
        const next = new Date(now);
        // Avanzar al próximo minuto exacto
        next.setSeconds(0, 0);
        next.setMinutes(next.getMinutes() + 1);
        const delay = next - now;

        setTimeout(() => {
            const n = new Date();
            // Sábado = 6, medianoche = 00:00
            if (n.getDay() === 6 && n.getHours() === 0 && n.getMinutes() === 0) {
                resetAllAvailabilities();
            }
            scheduleNextCheck();
        }, delay);
    }

    async function resetAllAvailabilities() {
        try {
            const snap = await db.collection("availabilities").get();
            const batch = db.batch();
            snap.docs.forEach(doc => batch.update(doc.ref, { days: [] }));
            await batch.commit();
            console.log("Disponibilidad reseteada automáticamente (Sábado 00:00)");
        } catch(e) {
            console.error("Error en reset automático:", e);
        }
    }

    scheduleNextCheck();
}

    function showToast(msg, type) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `p-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white shadow-2xl animate-toast ${type === 'success' ? 'bg-emerald-500' : (type === 'info' ? 'bg-blue-500' : 'bg-slate-900')}`;
        toast.innerText = msg;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    // --- 4. SINCRONIZACIÓN ---
    function initDataSync() {
        db.collection("users").onSnapshot(snap => {
            state.allUsers = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (state.currentUser) state.userData = state.allUsers.find(u => u.id === state.currentUser.uid);
            render();
        });
        db.collection("matches").onSnapshot(snap => {
            state.matches = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            render();
        });
        db.collection("assignments").onSnapshot(snap => {
            state.assignments = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            render();
        });
        db.collection("availabilities").onSnapshot(snap => {
            state.availabilities = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            render();
        });
        db.collection("settings").doc("availability").onSnapshot(doc => {
            if (doc.exists) state.systemSettings = doc.data();
            render();
        });
        db.collection("exams").onSnapshot(snap => {
            state.exams = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            render();
        });
        db.collection("exam_results").onSnapshot(snap => {
            state.results = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            render();
        });
        // Sincronizar precios de categorías
        db.collection("categoryPrices").onSnapshot(snap => {
            let prices = {};
            snap.forEach(doc => { prices[doc.id] = doc.data().value; });
            state.categoryPrices = prices;
            render();
        });
        db.collection("categoryPricesPlanillero").onSnapshot(snap => {
            let prices = {};
            snap.forEach(doc => { prices[doc.id] = doc.data().value; });
            state.categoryPricesPlanillero = prices;
            render();
        });
        initAvailabilityResetScheduler();
    }

    auth.onAuthStateChanged(user => {
        if (user) { state.currentUser = user; initDataSync(); }
        else { state.currentUser = null; render(); }
    });

// --- 5. FUNCIONES ADMIN ---

    window.handleLogin = async () => {
        const email = document.getElementById('login-email').value.trim();
        const pass = document.getElementById('login-pass').value;
        try { await auth.signInWithEmailAndPassword(email, pass); } catch (e) { alert("Error: " + e.message); }
    };

    window.handleLogout = () => { auth.signOut(); location.reload(); };

    window.handleUpdatePrice = async (cat) => {
        const current = state.categoryPrices[cat] || 0;
        const newVal = prompt(`Ingrese el nuevo valor para la categoría ${cat}:`, current);
        if (newVal !== null) {
            await db.collection("categoryPrices").doc(cat).set({ value: parseFloat(newVal) });
            showToast(`Precio de ${cat} actualizado`, "success");
        }
    };
    window.handleUpdatePricePlanillero = async (cat) => {
        const current = state.categoryPricesPlanillero[cat] || 0;
        const newVal = prompt(`Ingrese el nuevo valor para planilleros - categoría ${cat}:`, current);
        if (newVal !== null) {
            await db.collection("categoryPricesPlanillero").doc(cat).set({ value: parseFloat(newVal) });
            showToast(`Precio planillero de ${cat} actualizado`, "success");
        }
    };

    window.handleUpdateUserFinance = async (uid, field, label) => {
        const user = state.allUsers.find(u => u.id === uid);
        const current = user[field] || 0;
        const newVal = prompt(`Ingrese monto para ${label}:`, current);
        if (newVal !== null) {
            await db.collection("users").doc(uid).update({ [field]: parseFloat(newVal) });
            showToast("Dato actualizado", "success");
        }
    };

    window.handleEnableAvailabilityToday = async () => {
        await db.collection("settings").doc("availability").set({ enabledDate: obtenerFechaHoy() });
        showToast("Reportes habilitados para hoy", "success");
    };

    window.handleDisableAvailability = async () => {
        await db.collection("settings").doc("availability").set({ enabledDate: "" });
        showToast("Reportes manuales cerrados", "info");
    };

    window.handleAddMatch = async () => {
        const home = document.getElementById('match-home').value.toUpperCase();
        const away = document.getElementById('match-away').value.toUpperCase();
        const category = document.getElementById('match-cat').value;
        const branch = document.getElementById('match-branch').value;
        const court = document.getElementById('match-court').value;
        const date = document.getElementById('match-date').value;
        const time = document.getElementById('match-time').value;

        if (!home || !away || !category || !branch || !date || !time || !court) return alert("Completa todos los campos.");

        await db.collection("matches").add({
            home, away, category, branch, court, date, time,
            timestamp: new Date(`${date}T${time}`).getTime()
        });
        showToast("ENCUENTRO GUARDADO", "success");
    };

// --- CARGA MASIVA EXCEL ---
window.handleExcelUpload = async () => {
    const fileInput = document.getElementById('excel-upload');
    const file = fileInput.files[0];
    if (!file) return alert("Por favor selecciona un archivo Excel primero.");

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array', raw: false, dateNF: 'yyyy-mm-dd' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const rawJson = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });

            if (rawJson.length === 0) return alert("El Excel parece estar vacío.");

            const batch = db.batch();
            let count = 0;
            let errors = [];

            rawJson.forEach((row, index) => {
                const keys = Object.keys(row);

                // Busca la columna probando múltiples nombres posibles
                const getVal = (...searches) => {
                    for (const search of searches) {
                        const found = keys.find(k => k.trim().toLowerCase().replace(/\*/g, '') === search.toLowerCase().replace(/\*/g, ''));
                        if (found && String(row[found]).trim() !== "") return String(row[found]).trim();
                    }
                    return "";
                };

                let date    = getVal("Dia*", "Dia", "Día", "DIA", "FECHA");
                let time    = getVal("Horario*", "Horario", "HORARIO", "Hora", "HORA");
                const court = getVal("Lugar*", "Lugar", "LUGAR", "Cancha", "CANCHA");
                const rawCat= getVal("Categoria*", "Categoria", "Categoría", "CATEGORIA", "Cat", "CAT");
                const home  = getVal("Local*", "Local", "LOCAL").toUpperCase();
                const away  = getVal("Visitante*", "Visitante", "VISITANTE").toUpperCase();
                const rama  = getVal("Rama", "RAMA");

                const copa      = getVal("Copa", "COPA");
                const instancia = getVal("Instancia", "INSTANCIA");
                const zona      = getVal("Codigo/Zona", "Codigo", "Zona", "ZONA");

                if (!date || !time || !court || !rawCat || !home || !away) {
                    errors.push(`Fila ${index + 2}: Faltan datos obligatorios`);
                    return;
                }

                // Normalizar fecha
                if (!isNaN(date) && Number(date) > 20000) {
                    const parsedDate = new Date((Number(date) - 25569) * 86400 * 1000);
                    const year  = parsedDate.getUTCFullYear();
                    const month = String(parsedDate.getUTCMonth() + 1).padStart(2, '0');
                    const day   = String(parsedDate.getUTCDate()).padStart(2, '0');
                    date = `${year}-${month}-${day}`;
                } else if (date.includes('/')) {
                    const parts = date.split('/');
                    if (parts.length === 3 && parts[2].length === 4) {
                        date = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                    }
                }

                // Normalizar hora
                if (!time.includes(':') && !isNaN(time) && Number(time) > 0 && Number(time) < 1) {
                    let totalMinutes = Math.round(Number(time) * 24 * 60);
                    let hours   = Math.floor(totalMinutes / 60);
                    let minutes = totalMinutes % 60;
                    time = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
                } else {
                    time = time.replace('.', ':');
                    if (time.length === 4 && time.includes(':')) time = "0" + time;
                }

                // Inferir rama desde la categoría si no viene en el Excel
                let branch = rama || "Mixto";
                if (!rama) {
                    if (rawCat.toUpperCase().includes("FEM")) branch = "Femenino";
                    else if (rawCat.toUpperCase().includes("MASC")) branch = "Masculino";
                }

                const docRef = db.collection("matches").doc();
                batch.set(docRef, {
                    home,
                    away,
                    category: rawCat,
                    branch,
                    court,
                    date,
                    time,
                    copa,
                    instancia,
                    zona,
                    timestamp: new Date(`${date}T${time}`).getTime() || Date.now()
                });

                count++;
            });

            if (count > 0) {
                await batch.commit();
                showToast(`${count} partidos cargados exitosamente`, "success");
                fileInput.value = "";
                if (errors.length > 0) {
                    alert(`Se cargaron ${count} partidos, pero hubo filas incompletas que se ignoraron:\n` + errors.join('\n'));
                }
            } else {
                alert("No se encontró ningún encuentro válido. Verifica el formato del archivo.");
            }

        } catch (error) {
            console.error("Error al leer Excel:", error);
            alert("Error al procesar el archivo. Asegúrate de que es un Excel válido.");
        }
    };
    reader.readAsArrayBuffer(file);
};


// --- MODIFICACIÓN: DESIGNACIÓN (1er Árbitro y Planillero Obligatorios) ---
    window.handleAssignBatch = async () => {
        const matchId = document.getElementById('adm-match-select').value;
        if (!matchId) return alert("Selecciona un partido.");

        const selected = [];
        state.roles.forEach((r, i) => {
            const uid = document.getElementById(`role-select-${i}`).value;
            if (uid) selected.push({ userId: uid, role: r });
        });
        
        // Verificamos obligatorios: 1er Árbitro (index 0) y Planillero (index 2)
        const hasFirstRef = selected.find(s => s.role === state.roles[0]);
        const hasPlanillero = selected.find(s => s.role === state.roles[2]);

        if (!hasFirstRef || !hasPlanillero) {
            return alert("Error: El 1er Árbitro y el Planillero son obligatorios.");
        }

        const batch = db.batch();
        state.assignments.filter(a => a.matchId === matchId).forEach(a => batch.delete(db.collection("assignments").doc(a.id)));
        selected.forEach(s => batch.set(db.collection("assignments").doc(), { matchId, ...s }));
        await batch.commit();
        showToast("DESIGNACIÓN CONFIRMADA", "success");
    };

    // --- ACEPTAR / RECHAZAR DESIGNACIÓN ---
    window.handleAcceptAssignment = async (assignId) => {
        try {
            await db.collection("assignments").doc(assignId).update({ status: 'accepted' });
            showToast("Designación aceptada", "success");
        } catch(e) { alert("Error: " + e.message); }
    };

    window.handleRejectAssignment = async (assignId) => {
        const reason = prompt("¿Motivo del rechazo? (opcional):");
        try {
            await db.collection("assignments").doc(assignId).update({ status: 'rejected', rejectReason: reason || '' });
            showToast("Designación rechazada", "info");
        } catch(e) { alert("Error: " + e.message); }
    };

    // --- REASIGNAR ROL INDIVIDUAL ---
    window.handleReassignRole = async (assignId, matchId, role) => {
        const refs = state.allUsers.filter(u => u.role?.toLowerCase() === 'user');
        const match = state.matches.find(m => m.id === matchId);
        if (!match) return;
        const matchDay = obtenerNombreDia(match.date);
        const matchHour = match.time.split(':')[0] + ":00";
        const otherAssigns = state.assignments.filter(a => a.matchId === matchId && a.id !== assignId);
        const otherIds = otherAssigns.map(a => a.userId);
        const available = refs.filter(u => {
            const av = state.availabilities.find(a => a.userId === u.id);
            const dayAv = av?.days?.find(d => d.name === matchDay);
            return dayAv?.slots?.includes(matchHour) && !otherIds.includes(u.id);
        });
        const options = available.map((u, i) => `${i + 1}. ${u.name}`).join('\n');
        const choice = prompt(`Reasignar "${role}".\nÁrbitros disponibles:\n${options || 'Ninguno disponible'}\n\nIngresá el número:`);
        if (!choice) return;
        const idx = parseInt(choice) - 1;
        if (isNaN(idx) || !available[idx]) return alert("Selección inválida.");
        await db.collection("assignments").doc(assignId).update({ userId: available[idx].id, status: 'pending', rejectReason: '' });
        showToast(`${role} reasignado a ${available[idx].name}`, "success");
    };

    // --- COLOR DE ÁRBITRO (popover 8 colores) ---
    const COLOR_PALETTE = ['#ef4444','#3b82f6','#22c55e','#eab308','#f97316','#ec4899','#8b5cf6','#06b6d4'];

    window.handleSetUserColor = (uid) => {
        // Cerrar cualquier popover previo
        const prev = document.getElementById('color-popover');
        if (prev) { prev.remove(); return; }

        const btn = document.querySelector(`[data-colorpicker="${uid}"]`);
        if (!btn) return;

        const popover = document.createElement('div');
        popover.id = 'color-popover';
        popover.style.cssText = 'position:fixed;z-index:9999;background:#1e293b;border-radius:16px;padding:12px;box-shadow:0 8px 32px rgba(0,0,0,0.35);display:flex;flex-direction:column;gap:10px;';

        const rect = btn.getBoundingClientRect();
        const top = rect.bottom + 8;
        const left = Math.min(rect.left, window.innerWidth - 220);
        popover.style.top = top + 'px';
        popover.style.left = left + 'px';

        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:8px;';

        COLOR_PALETTE.forEach(color => {
            const circle = document.createElement('button');
            circle.style.cssText = `width:36px;height:36px;border-radius:50%;background:${color};border:3px solid transparent;cursor:pointer;transition:transform 0.15s,border-color 0.15s;`;
            circle.title = color;
            circle.onmouseenter = () => { circle.style.transform = 'scale(1.2)'; circle.style.borderColor = '#fff'; };
            circle.onmouseleave = () => { circle.style.transform = 'scale(1)'; circle.style.borderColor = 'transparent'; };
            circle.onclick = async () => {
                await db.collection("users").doc(uid).update({ labelColor: color });
                showToast("Color actualizado", "success");
                popover.remove();
            };
            grid.appendChild(circle);
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.innerText = '✕ Quitar color';
        cancelBtn.style.cssText = 'width:100%;padding:6px;background:#334155;color:#94a3b8;border-radius:8px;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:0.05em;cursor:pointer;border:none;';
        cancelBtn.onmouseenter = () => { cancelBtn.style.background = '#ef4444'; cancelBtn.style.color = '#fff'; };
        cancelBtn.onmouseleave = () => { cancelBtn.style.background = '#334155'; cancelBtn.style.color = '#94a3b8'; };
        cancelBtn.onclick = async () => {
            await db.collection("users").doc(uid).update({ labelColor: '' });
            showToast("Color eliminado", "info");
            popover.remove();
        };

        popover.appendChild(grid);
        popover.appendChild(cancelBtn);
        document.body.appendChild(popover);

        // Cerrar al hacer click afuera
        setTimeout(() => {
            document.addEventListener('click', function closePopover(e) {
                if (!popover.contains(e.target)) {
                    popover.remove();
                    document.removeEventListener('click', closePopover);
                }
            });
        }, 100);
    };

    window.handleDeleteMatch = async (id) => {
        if (confirm("¿Eliminar partido?")) {
            const batch = db.batch();
            batch.delete(db.collection("matches").doc(id));
            state.assignments.filter(a => a.matchId === id).forEach(a => batch.delete(db.collection("assignments").doc(a.id)));
            await batch.commit();
            showToast("BORRAR", "info");
        }
    };

    window.handleTogglePayment = async (uid, status) => { await db.collection("users").doc(uid).update({ paid: !status }); };

    window.handleSetAllPayments = async (value) => {
        const refs = state.allUsers.filter(u => u.role?.toLowerCase() === 'user' || u.role?.toLowerCase() === 'planillero');
        const batch = db.batch();
        refs.forEach(u => batch.update(db.collection("users").doc(u.id), { paid: value }));
        await batch.commit();
    };

    window.handleApplySanction = async (uid) => {
        const reason = prompt("Motivo de la sanción:");
        if (reason) await db.collection("users").doc(uid).update({ sanction: { active: true, reason } });
    };

    window.handleClearSanction = async (uid) => {
        if (confirm("¿Levantar?")) await db.collection("users").doc(uid).update({ sanction: { active: false, reason: "" } });
    };

// --- 6. EXÁMENES (MANTENIDO) ---
    window.handleCreateExam = async () => {
        const title = prompt("Título del Examen:");
        if (!title) return;
        const qCount = parseInt(prompt("¿Cuántas preguntas?"));
        const questions = [];
        for(let i=0; i<qCount; i++) {
            const text = prompt(`Pregunta ${i+1}:`);
            const o1 = prompt("Opción A:");
            const o2 = prompt("Opción B:");
            const o3 = prompt("Opción C:");
            const correct = parseInt(prompt("Número correcta (1, 2 o 3):")) - 1;
            questions.push({ text, options: [o1, o2, o3], correct });
        }
        await db.collection("exams").add({ title, questions, active: false, createdAt: Date.now() });
    };

    window.handleToggleExam = async (id, status) => { await db.collection("exams").doc(id).update({ active: !status }); };
    window.handleDeleteExam = async (id) => {
        if (confirm("¿Está seguro de eliminar esta evaluación definitivamente?")) {
            await db.collection("exams").doc(id).delete();
            showToast("EVALUACIÓN ELIMINADA", "info");
        }
    };

    window.startExam = (exam) => {
        state.currentExam = exam;
        state.view = 'taking_exam';
        state.examProgress = { index: 0, answers: [], timeLeft: 45, timer: null };
        render();
        runExamTimer();
    };

    function runExamTimer() {
        if(state.examProgress.timer) clearInterval(state.examProgress.timer);
        state.examProgress.timeLeft = 45;
        state.examProgress.timer = setInterval(() => {
            state.examProgress.timeLeft--;
            if(state.examProgress.timeLeft <= 0) { window.submitAnswer(-1); }
            else { 
                const el = document.getElementById('exam-timer');
                if(el) el.innerText = state.examProgress.timeLeft;
            }
        }, 1000);
    }

    window.submitAnswer = async (ans) => {
        state.examProgress.answers.push(ans);
        if (state.examProgress.index < state.currentExam.questions.length - 1) {
            state.examProgress.index++;
            render();
            runExamTimer();
        } else {
            clearInterval(state.examProgress.timer);
            let score = 0;
            state.currentExam.questions.forEach((q, i) => { if(q.correct === state.examProgress.answers[i]) score++; });
            const note = Math.round((score / state.currentExam.questions.length) * 100);
            await db.collection("exam_results").add({ userId: state.currentUser.uid, examId: state.currentExam.id, score: note, date: Date.now() });
            state.view = 'home'; state.currentExam = null;
            alert("Examen Finalizado.");
            render();
        }
    };

    window.selectFullDay = (dayName) => { document.querySelectorAll(`.day-slot[data-day="${dayName}"]`).forEach(cb => { cb.checked = true; }); };
    window.clearAllAvailability = () => { if(confirm("¿Limpiar todo?")) document.querySelectorAll('.day-slot').forEach(cb => { cb.checked = false; }); };

    window.handleCheckIn = async (assignId, matchTime) => {
        const processCheckIn = async (coords = null) => {
            const now = new Date();
            const currentMins = now.getHours() * 60 + now.getMinutes();
            

            const [h, m] = matchTime.split(':').map(Number);
            const matchMins = h * 60 + m;
            
            const diff = matchMins - currentMins;
            
            let status = "";
            if (diff >= 15 && diff <= 45) {
                status = "A TIEMPO";
            } else if (diff > 45) {
                status = "MUY TEMPRANO";
            } else {
                status = "TARDE";
            }

            try {
                await db.collection("assignments").doc(assignId).update({
                    checkIn: now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
                    checkInStatus: status,
                    coords: coords ? { lat: coords.latitude, lng: coords.longitude } : null
                });
                showToast("Llegada registrada exitosamente", "success");
                render(); 
            } catch (e) {
                console.error("Error al registrar:", e);
                alert("Error al conectar con la base de datos.");
            }
        };

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => processCheckIn(pos.coords),
                (err) => {
                    console.warn("GPS denegado o error. Registrando solo hora.");
                    processCheckIn(null); 
                },
                { timeout: 5000 }
            );
        } else {
            processCheckIn(null);
        }
    };

    window.saveAvailability = async () => {
        const selected = [];
        document.querySelectorAll('.day-slot:checked').forEach(cb => {
            const day = cb.dataset.day; const slot = cb.dataset.slot;
            let d = selected.find(x => x.name === day);
            if(!d){ d = {name: day, slots: []}; selected.push(d); }
            d.slots.push(slot);
        });
        const query = await db.collection("availabilities").where("userId", "==", state.currentUser.uid).get();
        if(!query.empty) await db.collection("availabilities").doc(query.docs[0].id).update({ days: selected });
        else await db.collection("availabilities").add({ userId: state.currentUser.uid, days: selected });
        showToast("Horarios guardados", "success");
    };
    window.handleDeleteAllMatches = async () => {
    if (!confirm("¿Seguro que querés borrar TODOS los partidos y sus designaciones? Esta acción no se puede deshacer.")) return;
    try {
        const matchSnap = await db.collection("matches").get();
        const assignSnap = await db.collection("assignments").get();
        const batch = db.batch();
        matchSnap.docs.forEach(doc => batch.delete(doc.ref));
        assignSnap.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        showToast("Todos los partidos eliminados", "success");
    } catch(e) {
        alert("Error: " + e.message);
    }
};

    window.saveProfile = async () => {
        const phone = document.getElementById('prof-phone').value;
        const dni = document.getElementById('prof-dni').value;
        
        try {
            await db.collection("users").doc(state.currentUser.uid).update({
                phone: phone,
                dni: dni
            });
            showToast("Perfil actualizado exitosamente", "success");
            state.view = 'home';
            render();
        } catch (error) {
            alert("Error al guardar el perfil: " + error.message);
        }
    };
    window.exportPDF = () => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        doc.text("PLANILLA DE DESIGNACIONES - C.A.V.M", 10, 10);
        const rows = state.matches.map(m => {
            const as = state.assignments.filter(a => a.matchId === m.id);
            const refs = as.map(a => `${a.role}: ${state.allUsers.find(u => u.id === a.userId)?.name || '-'}`).join('\n');
            return [m.date, m.time, `${m.home} vs ${m.away}`, m.category, m.court, refs];
        });
        doc.autoTable({ head: [['Fecha', 'Hora', 'Partido', 'Cat.', 'Cancha', 'Equipo Arbitral']], body: rows, startY: 20 });
        doc.save(`Designaciones_${obtenerFechaHoy()}.pdf`);
    };

// --- 8. VISTAS ---

    function viewNavbar() {
        const isAdmin = state.userData?.role?.toLowerCase() === 'admin';
        const roleText = isAdmin ? 'ADMINISTRADOR' : `SOCIO: ${state.userData?.paid ? 'ACTIVO' : 'PENDIENTE'}`;
        return `<nav class="bg-white border-b h-16 sm:h-20 px-4 sm:px-8 flex items-center justify-between sticky top-0 z-50">
            <div class="flex items-center gap-2 sm:gap-3 min-w-0"><div class="w-8 h-8 sm:w-10 sm:h-10 bg-slate-900 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center"><img src="./Assets/logoArbitros.jpeg" class="w-full h-full object-cover"></div><div class="min-w-0"><p class="text-[9px] sm:text-[10px] font-black uppercase leading-tight text-slate-800 truncate max-w-[120px] sm:max-w-none">${state.userData?.name || '...'}</p><p class="text-[7px] sm:text-[8px] font-bold text-blue-600 uppercase mt-0.5">${roleText}</p></div></div>
            <div class="flex gap-2 sm:gap-4 flex-shrink-0">
                <button onclick="state.view='home';render();" class="text-[8px] sm:text-[9px] font-black uppercase ${state.view==='home'?'text-slate-900':'text-slate-400'} hover:text-slate-900 transition-colors">Inicio</button>
                ${isAdmin ? `<button onclick="state.view='settlement';render();" class="text-[8px] sm:text-[9px] font-black uppercase ${state.view==='settlement'?'text-slate-900':'text-slate-400'} hover:text-slate-900 transition-colors">Liquidación</button>` : ''}
                <button onclick="state.view='profile';render();" class="text-[8px] sm:text-[9px] font-black uppercase ${state.view==='profile'?'text-slate-900':'text-slate-400'} hover:text-slate-900 transition-colors">Perfil</button>
                <button onclick="handleLogout()" class="text-red-500 font-bold uppercase text-[8px] sm:text-[10px] hover:text-red-700 transition-colors">Salir</button>
            </div>
        </nav>`;
    }

    function viewLogin() {
        return `<div class="min-h-screen flex items-center justify-center p-6 bg-cover bg-center relative" style="background-image: url('./Assets/fondoCPAP.png');"><div class="absolute inset-0 bg-slate-900/60"></div><div class="bg-white p-10 rounded-[2.5rem] shadow-2xl w-full max-w-md relative z-10 text-center"><h1 class="text-2xl font-black mb-10 uppercase tracking-tighter text-slate-800">Gestión de Arbitros</h1><div class="space-y-4 text-left"><input type="email" id="login-email" placeholder="Email" class="w-full p-4 bg-slate-50 border rounded-2xl font-bold outline-none"><input type="password" id="login-pass" placeholder="Contraseña" class="w-full p-4 bg-slate-50 border rounded-2xl font-bold outline-none"><button onclick="window.handleLogin()" class="w-full py-4 bg-slate-900 text-white font-black rounded-2xl uppercase text-[10px] tracking-widest">Ingresar</button></div></div></div>`;
    }

// ---  LIQUIDACIÓN ---
    function viewSettlement() {
        const refs = state.allUsers
        .filter(u => u.role?.toLowerCase() === 'user' || u.role?.toLowerCase() === 'planillero')
        .sort((a, b) => a.name.localeCompare(b.name));
        return `
        <div class="bg-white p-8 rounded-[2rem] border shadow-sm overflow-hidden font-black">
            <h2 class="text-xs font-black uppercase mb-6 text-blue-600 tracking-widest font-black uppercase">Planilla de Liquidación (Comisión 15%)</h2>
            <div class="overflow-x-auto">
                <table class="w-full text-left text-[9px] font-bold uppercase font-black">
                    <thead class="bg-slate-50 text-slate-400 font-black">
                        <tr>
                            <th class="p-4">Árbitro / Email</th>
                            <th class="p-4 text-blue-600">Comisión 15%</th>
                            <th class="p-4">Afiliación</th>
                            <th class="p-4">Indumentaria</th>
                            <th class="p-4">Seguro</th>
                            <th class="p-4">Préstamos</th>
                            <th class="p-4 bg-slate-100 text-slate-900">Total Final</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y font-black">
                        ${refs.map(u => {
                            // 1. Calcular comisión del 15% por partidos dirigidos
                            const hisAssigns = state.assignments.filter(a => a.userId === u.id);
                            let total15 = 0;
                            hisAssigns.forEach(a => {
                                const m = state.matches.find(match => match.id === a.matchId);
                                if(m) {
                                    const isPlanillero = u.role?.toLowerCase() === 'planillero';
                                    const precioCat = isPlanillero
                                        ? (state.categoryPricesPlanillero[m.category] || 0)
                                        : (state.categoryPrices[m.category] || 0);
                                    total15 += (precioCat * 0.15);
                                }
                            });

                            // 2. Obtener valores eventuales
                            const afil = u.afiliacion || 0;
                            const indu = u.indumentaria || 0;
                            const segu = u.seguro || 0;
                            const pres = u.prestamos || 0;

                            // 3. Calcular el TOTAL SUMADO
                            const totalFinal = total15 + afil + indu + segu + pres;

                            return `
                            <tr>
                                <td class="p-4">${u.name}<br><span class="text-slate-400 lowercase font-normal">${u.email || ''}</span></td>
                                <td class="p-4 text-blue-600 font-black">$${total15.toLocaleString()}</td>
                                <td class="p-4 cursor-pointer hover:bg-slate-100" onclick="handleUpdateUserFinance('${u.id}','afiliacion','Afiliación')">$${afil.toLocaleString()} ✏️</td>
                                <td class="p-4 cursor-pointer hover:bg-slate-100" onclick="handleUpdateUserFinance('${u.id}','indumentaria','Indumentaria')">$${indu.toLocaleString()} ✏️</td>
                                <td class="p-4 cursor-pointer hover:bg-slate-100" onclick="handleUpdateUserFinance('${u.id}','seguro','Seguro')">$${segu.toLocaleString()} ✏️</td>
                                <td class="p-4 cursor-pointer hover:bg-slate-100" onclick="handleUpdateUserFinance('${u.id}','prestamos','Préstamos')">$${pres.toLocaleString()} ✏️</td>
                                <td class="p-4 bg-slate-50 text-sm font-black text-slate-900">$${totalFinal.toLocaleString()}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>`;
    }

function viewAdmin() {
    const refs = state.allUsers
    .filter(u => u.role?.toLowerCase() === 'user' || u.role?.toLowerCase() === 'planillero')
    .sort((a, b) => a.name.localeCompare(b.name));
    const assignedIds = state.assignments.map(a => a.matchId);
    const unassigned = state.matches.filter(m => !assignedIds.includes(m.id));
    const selMatchId = document.getElementById('adm-match-select')?.value;
    const selMatch = state.matches.find(m => m.id === selMatchId);
    const hoyHab = state.systemSettings.enabledDate === obtenerFechaHoy();

    return `
    <div class="space-y-8">
        <div class="flex gap-2 overflow-x-auto pb-2">
            <button onclick="state.view='home';render();" class="px-4 py-2 ${state.view==='home'?'bg-slate-900 text-white':'bg-white text-slate-400'} rounded-xl text-[9px] font-black uppercase border">General</button>
            <button onclick="state.view='admin_exams';render();" class="px-4 py-2 ${state.view==='admin_exams'?'bg-blue-600 text-white':'bg-white text-slate-400'} rounded-xl text-[9px] font-black uppercase border">Evaluaciones</button>
            <button onclick="state.view='admin_ranking';render();" class="px-4 py-2 ${state.view==='admin_ranking'?'bg-amber-500 text-white':'bg-white text-slate-400'} rounded-xl text-[9px] font-black uppercase border">Ranking</button>
        </div>

        ${state.view === 'home' ? `
        <div class="bg-white p-8 rounded-[2rem] border shadow-sm font-black mb-8">
            <div class="flex justify-between items-center">
                <h2 class="text-xs font-black uppercase text-blue-600">Disponibilidad de Árbitros</h2>
                <button onclick="const l=this.closest('.bg-white').querySelector('.availability-list');l.classList.toggle('hidden');this.textContent=l.classList.contains('hidden')?'Ver':'Ocultar';" class="text-[8px] font-black bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg uppercase">Ver</button>
            </div>
            <div class="availability-list hidden mt-6">
                <div class="grid md:grid-cols-3 gap-6 font-black">
                    ${refs.map(r => {
                        const avail = state.availabilities.find(a => a.userId === r.id);
                        return `
                            <div class="p-4 bg-slate-50 rounded-2xl border font-black">
                                <p class="text-[10px] font-black uppercase mb-2 border-b pb-1 text-slate-800 font-black">${r.name}</p>
                                <div class="space-y-1 font-black">
                                    ${avail && avail.days && avail.days.length > 0 
                                        ? avail.days.map(d => `
                                            <p class="text-[8px] font-black uppercase text-blue-500">
                                                ${d.name}: <span class="text-slate-500 font-bold font-black">${d.slots.join(', ').replace(/:00/g, '')}</span>
                                            </p>
                                        `).join('') 
                                        : '<p class="text-[8px] text-slate-300 italic uppercase">Sin Reportes</p>'
                                    }
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        </div>
        ` : ''}

        ${state.view === 'admin_exams' ? viewExamsList() : state.view === 'admin_ranking' ? viewRanking() : `
        
        <div class="bg-white p-4 sm:p-8 rounded-[2rem] border shadow-sm font-black">
            <h2 class="text-xs font-black uppercase mb-6 text-emerald-600 tracking-widest">1. CARGAR ENCUENTRO</h2>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <input type="text" id="match-home" placeholder="LOCAL" class="p-3 bg-slate-50 border rounded-xl text-xs font-bold uppercase outline-none">
                <input type="text" id="match-away" placeholder="VISITANTE" class="p-3 bg-slate-50 border rounded-xl text-xs font-bold uppercase outline-none">
                <select id="match-cat" class="p-3 bg-slate-50 border rounded-xl text-xs font-bold uppercase outline-none">
                    <option value="">-- CATEGORÍA --</option>
                    ${state.categories.map(c => `<option value="${c}">${c}</option>`).join('')}
                </select>
                <select id="match-branch" class="p-3 bg-slate-50 border rounded-xl text-xs font-bold uppercase outline-none">
                    <option value="">-- RAMA --</option>
                    ${state.branches.map(b => `<option value="${b}">${b}</option>`).join('')}
                </select>
                <input type="text" id="match-court" placeholder="LUGAR" class="sm:col-span-2 p-3 bg-slate-50 border rounded-xl text-xs font-bold uppercase outline-none">
                <input type="date" id="match-date" class="p-3 bg-slate-50 border rounded-xl text-xs font-bold outline-none">
                <input type="time" id="match-time" class="p-3 bg-slate-50 border rounded-xl text-xs font-bold outline-none">
                <button onclick="window.handleAddMatch()" class="sm:col-span-2 py-4 bg-emerald-600 text-white font-black rounded-xl uppercase text-[10px] tracking-widest shadow-lg">GUARDAR ENCUENTRO</button>
            </div>
            <div class="mt-6 pt-6 border-t font-black">
                <h3 class="text-[10px] font-black uppercase mb-3 text-emerald-600">Carga Masiva (Excel)</h3>
                <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <input type="file" id="excel-upload" accept=".xlsx, .xls" class="p-2 bg-slate-50 border rounded-xl text-xs font-bold outline-none w-full sm:flex-1 min-w-0">
                    <button onclick="window.handleExcelUpload()" class="w-full sm:w-auto px-6 py-3 bg-emerald-600 text-white font-black rounded-xl uppercase text-[10px] tracking-widest shadow-lg hover:bg-emerald-700">PROCESAR</button>
                </div>
                <p class="text-[8px] text-slate-400 uppercase mt-2">Columnas requeridas: Dia*, Horario*, Lugar*, Categoria*, Local*, Visitante*</p>
            </div>
            <div class="mt-6 pt-6 border-t">
                <p class="text-[8px] font-black text-slate-400 mb-2 uppercase tracking-wider">Precios por Categoría — Árbitros:</p>
                <div class="flex flex-wrap gap-2 mb-4">
                    ${state.categories.map(cat => `
                        <button onclick="handleUpdatePrice('${cat}')" class="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[7px] font-black uppercase hover:bg-white transition-all">
                            ${cat}: $${(state.categoryPrices[cat] || 0).toLocaleString()} ✏️
                        </button>
                    `).join('')}
                </div>
                <p class="text-[8px] font-black text-amber-500 mb-2 uppercase tracking-wider">Precios por Categoría — Planilleros:</p>
                <div class="flex flex-wrap gap-2">
                    ${state.categories.map(cat => `
                        <button onclick="handleUpdatePricePlanillero('${cat}')" class="px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-[7px] font-black uppercase hover:bg-white transition-all">
                            ${cat}: $${(state.categoryPricesPlanillero[cat] || 0).toLocaleString()} ✏️
                        </button>
                    `).join('')}
                </div>
            </div>
        </div>

        <div class="bg-white p-8 rounded-[2rem] border shadow-sm font-black">
            <h2 class="text-xs font-black uppercase mb-6 text-indigo-600 tracking-widest uppercase font-black">2. DESIGNAR EQUIPO ARBITRAL</h2>
            <div class="space-y-4">
                <select id="adm-match-select" onchange="render()" class="w-full p-4 bg-slate-900 text-white rounded-2xl text-xs font-bold uppercase outline-none font-black">
                    <option value="">-- SELECCIONAR PARTIDO --</option>
                    ${unassigned.map(m => `<option value="${m.id}" ${selMatchId === m.id ? 'selected' : ''}>${m.home} vs ${m.away} (${m.category}) - ${m.time}HS</option>`).join('')}
                </select>
                <div class="grid gap-2">
                    ${state.roles.map((role, i) => {
                        const isMandatory = (role === "1er Árbitro" || role === "Planillero");
                        const isPlanilleroRole = role === "Planillero";
                        const allCandidates = state.allUsers.filter(u => {
                            const r = u.role?.toLowerCase();
                            return isPlanilleroRole ? r === 'planillero' : r === 'user';
                        });
                        const filteredRefs = allCandidates.filter(u => {
                            if (!selMatch) return false;
                            const matchDay = obtenerNombreDia(selMatch.date);
                            const matchHour = selMatch.time.split(':')[0] + ":00"; 
                            const av = state.availabilities.find(a => a.userId === u.id);
                            const dayAv = av?.days?.find(d => d.name === matchDay);
                            const isAvailable = dayAv?.slots?.includes(matchHour);
                            const otherSelectedIds = state.roles.map((_, index) => {
                                if (index === i) return null; 
                                return document.getElementById(`role-select-${index}`)?.value;
                            }).filter(id => id);
                            const isAlreadySelected = otherSelectedIds.includes(u.id);
                            return isAvailable && !isAlreadySelected;
                        });
                        return `<div class="flex items-center gap-2">
                            <label class="w-32 text-[8px] font-black uppercase ${isMandatory ? 'text-slate-900' : 'text-slate-400'} font-black">${role}${isMandatory ? '*' : ''}:</label>
                            <div class="flex-1 relative">
                                <select id="role-select-${i}" onchange="render()" class="w-full p-2 border rounded-lg text-[9px] font-bold uppercase outline-none font-black transition-all" style="${(() => { const currentVal = document.getElementById(`role-select-${i}`)?.value; const selUser = currentVal ? filteredRefs.find(u => u.id === currentVal) : null; return selUser?.labelColor ? `background-color:${selUser.labelColor}22;border-color:${selUser.labelColor}88;` : 'background-color:#f8fafc;'; })()}">
                                    <option value="">-- ${isMandatory ? 'Seleccionar' : 'Opcional'} --</option>
                                    ${filteredRefs.map(u => {
                                        const currentVal = document.getElementById(`role-select-${i}`)?.value;
                                        return `<option value="${u.id}" ${currentVal === u.id ? 'selected' : ''}>${u.name}</option>`;
                                    }).join('')}
                                </select>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
                <button onclick="window.handleAssignBatch()" class="w-full py-4 bg-indigo-600 text-white font-black rounded-2xl uppercase text-[10px] shadow-lg font-black font-black">CONFIRMAR DESIGNACIÓN</button>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">

            <div class="bg-white p-8 rounded-[2rem] border shadow-sm">
                <div class="flex justify-between items-center mb-6">
                    <h2 class="text-xs font-black uppercase text-amber-600 font-black">Control de Cuotas</h2>
                    <div class="flex gap-2 font-black">
                        <button onclick="handleSetAllPayments(true)" class="text-[8px] font-black bg-emerald-50 text-emerald-600 px-3 py-1 rounded-lg uppercase">TODOS</button>
                        <button onclick="handleSetAllPayments(false)" class="text-[8px] font-black bg-red-50 text-red-500 px-3 py-1 rounded-lg uppercase">REINICIAR</button>
                        <button onclick="const l=this.closest('.bg-white').querySelector('.cuotas-list');l.classList.toggle('hidden');this.textContent=l.classList.contains('hidden')?'Ver':'Ocultar';" class="text-[8px] font-black bg-amber-50 text-amber-600 px-3 py-1 rounded-lg uppercase">Ver</button>
                    </div>
                </div>
                <div class="cuotas-list hidden">
                    <div class="grid grid-cols-2 gap-3 font-black">
                        ${refs.map(u => {
                            const bgStyle = u.labelColor ? `background-color:${u.labelColor}22;border-color:${u.labelColor}66;` : '';
                            return `<div class="p-3 border rounded-xl flex justify-between items-center text-[9px] font-black uppercase" style="${bgStyle}"><span>${u.name}</span><div class="flex items-center gap-1"><button onclick="window.handleSetUserColor('${u.id}')" data-colorpicker="${u.id}" title="Color de árbitro" class="text-base leading-none hover:scale-110 transition-transform">🎨</button><button onclick="window.handleTogglePayment('${u.id}', ${u.paid})">${u.paid ? '✅' : '❌'}</button></div></div>`;
                        }).join('')}
                    </div>
                </div>
            </div>

            <div class="bg-white p-8 rounded-[2rem] border shadow-sm font-black">
                <div class="flex justify-between items-center mb-6 font-black">
                    <h2 class="text-xs font-black uppercase text-red-600 font-black">Sanciones / Sistema</h2>
                    <div class="flex gap-1 font-black">
                        <button onclick="window.handleEnableAvailabilityToday()" class="text-[7px] font-black ${hoyHab?'bg-emerald-500':'bg-slate-900'} text-white px-2 py-1.5 rounded-lg uppercase">${hoyHab?'HABILITADO':'HABILITAR HOY'}</button>
                        <button onclick="window.handleDisableAvailability()" class="text-[7px] font-black bg-red-600 text-white px-2 py-1.5 rounded-lg uppercase font-black">DESHABILITAR</button>
                        <button onclick="const l=this.closest('.bg-white').querySelector('.sanciones-list');l.classList.toggle('hidden');this.textContent=l.classList.contains('hidden')?'Ver':'Ocultar';" class="text-[7px] font-black bg-red-50 text-red-500 px-2 py-1.5 rounded-lg uppercase">Ver</button>
                    </div>
                </div>
                <div class="sanciones-list hidden">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 font-black">
                        ${refs.map(u => {
                            const s = u.sanction?.active;
                            return `<div class="p-3 border rounded-xl ${s ? 'bg-red-50' : 'bg-slate-50'} font-black"><div class="flex justify-between items-center mb-1 font-black"><span class="text-[9px] font-black uppercase">${u.name}</span><span class="text-[7px] font-bold px-1 rounded ${s ? 'bg-red-500 text-white' : 'bg-slate-200'} font-black">${s ? 'SANC.' : 'OK'}</span></div><button onclick="${s ? `window.handleClearSanction('${u.id}')` : `window.handleApplySanction('${u.id}')`}" class="w-full py-1.5 bg-slate-900 text-white rounded-lg text-[8px] font-black uppercase">${s ? 'Quitar' : 'Sancionar'}</button></div>`;
                        }).join('')}
                    </div>
                </div>
            </div>

        </div>

        <div class="bg-white rounded-[2rem] border shadow-sm overflow-hidden text-slate-700 font-black">
            <div class="p-6 bg-slate-900 text-white flex justify-between items-center font-black">
                <h3 class="text-[10px] font-black uppercase tracking-widest font-black">Planilla de Designaciones</h3>
                <div class="flex gap-2">
                    <button onclick="window.exportPDF()" class="bg-white/10 px-4 py-2 rounded-xl text-[9px] font-black uppercase">EXPORTAR PDF</button>
                    <button onclick="window.handleDeleteAllMatches()" class="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-xl text-[9px] font-black uppercase">BORRAR TODOS</button>
                </div>
            </div>
            <div class="overflow-x-auto font-black">
                <table class="w-full text-left text-[10px] font-bold uppercase text-slate-700 font-black">
                    <thead class="bg-slate-50 font-black uppercase text-slate-400 font-black">
                        <tr>
                            <th class="p-4 text-slate-400 font-black">Partido / Rama</th>
                            <th class="p-4 text-slate-400 font-black">Categoría / Cancha</th>
                            <th class="p-4 text-slate-400 font-black">Designación / Llegada</th>
                            <th class="p-4 font-black"></th>
                        </tr>
                    </thead>
                    <tbody class="divide-y font-black">
                        ${state.matches.map(m => {
                            const as = state.assignments.filter(a => a.matchId === m.id);
                            return `
                            <tr>
                                <td class="p-4 font-black">
                                    ${m.home} vs ${m.away}<br>
                                    <span class="text-blue-500 font-bold font-black">${m.branch}</span>
                                </td>
                                <td class="p-4 font-black">
                                    ${m.category}<br>
                                    <span class="text-slate-400 font-black">${m.date} | ${m.time} HS</span><br>
                                    <span class="text-indigo-600 font-black">${m.court}</span>
                                </td>
                                <td class="p-4 space-y-2 font-black">
                                    ${as.map(a => {
                                        const u = state.allUsers.find(x => x.id === a.userId);
                                        const statusColor = a.checkInStatus === 'A TIEMPO' ? 'text-emerald-500' : 'text-red-500';
                                        const assignStatus = a.status || 'pending';
                                        const userColor = u?.labelColor;
                                        const colorDot = userColor ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${userColor};margin-right:4px;vertical-align:middle;"></span>` : '';
                                        const acceptBadge = assignStatus === 'accepted'
                                            ? `<span class="ml-1 text-[7px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded uppercase">✅ Aceptó</span>`
                                            : assignStatus === 'rejected'
                                            ? `<span class="ml-1 text-[7px] font-black text-red-500 bg-red-50 px-1.5 py-0.5 rounded uppercase">❌ Rechazó</span>`
                                            : `<span class="ml-1 text-[7px] font-black text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded uppercase">⏳ Pend.</span>`;
                                        const reassignBtn = assignStatus === 'rejected'
                                            ? `<button onclick="window.handleReassignRole('${a.id}','${m.id}','${a.role}')" class="ml-1 text-[7px] font-black bg-indigo-600 text-white px-2 py-0.5 rounded uppercase hover:bg-indigo-700">Reasignar</button>`
                                            : '';
                                        return `
                                        <div class="border-b border-slate-50 pb-1">
                                            <span class="text-slate-400">${a.role}:</span> ${colorDot}${u?.name || '-'}${acceptBadge}${reassignBtn}
                                            ${a.checkIn ? `
                                                <div class="flex items-center gap-1">
                                                    <span class="${statusColor} text-[8px] font-black uppercase">[${a.checkInStatus}: ${a.checkIn}]</span>
                                                    ${a.coords ? `<a href="https://www.google.com/maps?q=${a.coords.lat},${a.coords.lng}" target="_blank" class="text-blue-500 underline text-[7px]">VER MAPA</a>` : ''}
                                                </div>
                                            ` : `<span class="text-amber-500 text-[8px] block italic">[PENDIENTE CHECK-IN]</span>`}
                                        </div>`;
                                    }).join('') || '<span class="text-amber-500 font-black italic">SIN DESIGNAR</span>'}
                                </td>
                                <td class="p-4 text-right">
                                    <button onclick="window.handleDeleteMatch('${m.id}')" class="text-red-400 font-black uppercase hover:text-red-600">BORRAR</button>
                                </td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
        `}
    </div>`;
}

    function viewExamsList() {
        return `<div class="space-y-6 font-black"><div class="bg-white p-8 rounded-[2rem] border shadow-sm flex justify-between items-center font-black"><h2 class="text-xs font-black uppercase text-blue-600 font-black">Gestión de Evaluaciones</h2><button onclick="window.handleCreateExam()" class="px-6 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest font-black">Nueva Evaluación</button></div><div class="grid md:grid-cols-2 gap-6 font-black">${state.exams.map(ex => `<div class="bg-white p-6 rounded-[2rem] border shadow-sm relative font-black"><button onclick="window.handleDeleteExam('${ex.id}')" class="absolute top-4 right-4 text-red-400 hover:text-red-600 text-[8px] font-black border border-red-100 px-2 py-1 rounded">ELIMINAR EXAMEN</button><p class="font-black uppercase text-sm mb-1 pr-20 font-black">${ex.title}</p><p class="text-[9px] text-slate-400 font-bold mb-4 uppercase font-black font-black">${ex.questions?.length || 0} Preguntas</p><button onclick="window.handleToggleExam('${ex.id}', ${ex.active})" class="w-full py-2 ${ex.active?'bg-amber-500':'bg-emerald-600'} text-white rounded-lg text-[9px] font-black uppercase font-black">${ex.active ? 'Desactivar' : 'Activar para Árbitros'}</button></div>`).join('')}</div></div>`;
    }

    function viewRanking() {
        const refs = state.allUsers.filter(u => u.role?.toLowerCase() === 'user');
        const ranking = refs.map(u => {
            const res = state.results.filter(r => r.userId === u.id).sort((a,b) => b.date - a.date);
            const tot = res.reduce((acc, c) => acc + c.score, 0);
            const avg = res.length > 0 ? Math.round(tot / res.length) : 0;
            const hist = res.map(r => r.score + '%').join(', ');
            return { name: u.name, avg, hist, count: res.length };
        }).sort((a,b) => b.avg - a.avg);
        return `<div class="bg-white p-8 rounded-[2rem] border shadow-sm overflow-hidden text-slate-700 font-black"><h2 class="text-xs font-black uppercase text-amber-600 mb-6 tracking-widest font-black">Ranking Anual</h2><div class="overflow-x-auto font-black"><table class="w-full text-left text-[10px] font-bold uppercase text-slate-700 font-black"><thead class="bg-slate-50 font-black uppercase text-slate-400 font-black"><tr><th class="p-4 font-black">Posición</th><th class="p-4 font-black">Árbitro</th><th class="p-4 font-black">Promedio</th><th class="p-4 font-black">Notas Históricas</th><th class="p-4 font-black">Completados</th></tr></thead><tbody class="divide-y font-black">${ranking.map((u, i) => `<tr><td class="p-4 font-black">#${i+1}</td><td class="p-4 font-black">${u.name}</td><td class="p-4 text-blue-600 font-black text-sm font-black">${u.avg}%</td><td class="p-4 text-slate-400 font-normal font-black font-black">${u.hist || '---'}</td><td class="p-4 font-black font-black">${u.count}</td></tr>`).join('')}</tbody></table></div></div>`;
    }

    function viewReferee() {
        const hoy = obtenerFechaHoy();
        const canRep = (new Date().getDay() === 0 || state.systemSettings.enabledDate === hoy) && state.userData?.paid && !state.userData?.sanction?.active;
        const myAssigns = state.assignments.filter(a => a.userId === state.currentUser.uid);
        const activeEx = state.exams.find(ex => ex.active && !state.results.some(r => r.examId === ex.id && r.userId === state.currentUser.uid));
        const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
        const myAv = state.availabilities.find(a => a.userId === state.currentUser.uid) || { days: [] };
        if (state.view === 'taking_exam') return viewTakingExam();

        const assignmentCards = myAssigns.map(a => {
            const m = state.matches.find(x => x.id === a.matchId);
            const assignStatus = a.status || 'pending';

            // Verificar si el partido está a menos de 2 horas
            const now = new Date();
            let buttonsClosed = false;
            if (m?.date && m?.time) {
                const matchDateTime = new Date(`${m.date}T${m.time}`);
                const diffMs = matchDateTime - now;
                const diffHours = diffMs / (1000 * 60 * 60);
                buttonsClosed = diffHours < 1;
            }
            const statusBadge = assignStatus === 'accepted'
                ? `<span class="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-lg text-[7px] font-black uppercase">✅ Aceptado</span>`
                : assignStatus === 'rejected'
                ? `<span class="px-2 py-0.5 bg-red-100 text-red-600 rounded-lg text-[7px] font-black uppercase">❌ Rechazado</span>`
                : `<span class="px-2 py-0.5 bg-amber-100 text-amber-600 rounded-lg text-[7px] font-black uppercase">⏳ Pendiente</span>`;
            const actionButtons = assignStatus === 'pending'
                ? (buttonsClosed
                    ? `<div class="p-3 bg-slate-100 text-slate-400 text-center rounded-2xl text-[9px] font-black uppercase border mb-3">⏰ Plazo vencido (–1hs del partido)</div>`
                    : `<div class="grid grid-cols-2 gap-2 mb-3"><button onclick="window.handleAcceptAssignment('${a.id}')" class="py-3 bg-emerald-600 text-white rounded-2xl text-[9px] font-black uppercase shadow hover:bg-emerald-700">✅ Aceptar</button><button onclick="window.handleRejectAssignment('${a.id}')" class="py-3 bg-red-500 text-white rounded-2xl text-[9px] font-black uppercase shadow hover:bg-red-600">❌ Rechazar</button></div>`)
                : assignStatus === 'rejected'
                ? `<div class="p-3 bg-red-50 text-red-500 text-center rounded-2xl text-[9px] font-black uppercase border border-red-100 mb-3">Designación rechazada</div>`
                : `<div class="p-3 bg-emerald-50 text-emerald-600 text-center rounded-2xl text-[9px] font-black uppercase border border-emerald-100 mb-3">Designación confirmada</div>`;
            const checkinSection = assignStatus !== 'rejected'
                ? (!a.checkIn
                    ? `<button onclick="window.handleCheckIn('${a.id}', '${m?.time}')" class="w-full py-4 bg-slate-900 text-white rounded-2xl text-[9px] font-black uppercase shadow-lg hover:bg-blue-700">Registrar Llegada</button>`
                    : `<div class="p-4 bg-emerald-50 text-emerald-600 text-center rounded-2xl text-[10px] font-black uppercase border border-emerald-100 italic">Ingreso: ${a.checkIn}</div>`)
                : '';
            return `<div class="bg-white p-8 rounded-[2rem] border shadow-sm font-black">
                <div class="flex justify-between items-center mb-3">
                    <span class="px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-[8px] font-black uppercase">${a.role}</span>
                    <div class="flex items-center gap-2">${statusBadge}<span class="text-xs font-black">${m?.time} HS</span></div>
                </div>
                <p class="text-center font-black uppercase text-sm text-slate-800 mb-1">${m?.home} vs ${m?.away}</p>
                <p class="text-center text-[8px] text-slate-400 font-black uppercase mb-4">${m?.date} · ${m?.court}</p>
                ${actionButtons}${checkinSection}
            </div>`;
        }).join('') || '<p class="text-center py-24 text-slate-300 font-black uppercase text-[10px]">Sin designaciones para esta semana.</p>';

        return `<div class="grid lg:grid-cols-12 gap-10 font-black"><div class="lg:col-span-7 space-y-6 font-black font-black font-black">${activeEx ? `<div class="bg-blue-600 p-8 rounded-[2rem] text-white shadow-xl shadow-blue-100 font-black font-black"><h3 class="font-black uppercase text-sm mb-1 font-black font-black">Evaluación Técnica Disponible</h3><p class="text-[9px] font-bold opacity-80 mb-4 uppercase font-black font-black">${activeEx.title}</p><button onclick="window.startExam(state.exams.find(e=>e.id==='${activeEx.id}'))" class="px-8 py-3 bg-white text-blue-600 rounded-xl font-black text-[10px] uppercase font-black font-black">Comenzar</button></div>` : ''}<div class="bg-white p-8 rounded-[2rem] border shadow-sm h-fit font-black font-black"><h2 class="text-xs font-black uppercase mb-6 text-blue-800 font-black font-black">Mi Disponibilidad</h2>${!canRep ? `<div class="bg-red-50 p-10 rounded-3xl text-center border border-red-100 font-black font-black"><p class="text-[10px] font-black text-red-700 uppercase mb-2 underline font-black font-black">${state.userData?.sanction?.active ? 'Sanción: ' + state.userData.sanction.reason : (state.userData?.paid ? 'Reportes cerrados' : 'CUOTA PENDIENTE (Debera consultar con el administrador para volver a ser usuario activo)')}</p></div>` : `<div class="space-y-4 font-black font-black">${days.map(day => { const saved = myAv.days?.find(d => d.name === day) || { slots: [] }; return `<div class="p-4 bg-slate-50 rounded-2xl border border-slate-100 font-black font-black"><div class="flex justify-between items-center mb-3 font-black font-black"><p class="text-[8px] font-black uppercase text-slate-400 font-black font-black">${day}</p><button onclick="window.selectFullDay('${day}')" class="text-[7px] font-black bg-blue-100 text-blue-600 px-2 py-1 rounded-md uppercase font-black font-black">Full Time</button></div><div class="grid grid-cols-4 sm:grid-cols-8 gap-2 font-black font-black">${state.timeSlots.map(s => `<label class="cursor-pointer font-black font-black"><input type="checkbox" class="hidden peer day-slot font-black font-black" data-day="${day}" data-slot="${s}" ${saved.slots.includes(s) ? 'checked' : ''}><div class="text-[8px] font-bold p-2 text-center border rounded-lg bg-white peer-checked:bg-blue-600 peer-checked:text-white transition-all uppercase text-slate-300 font-black font-black font-black font-black">${s.replace(':00', '')}</div></label>`).join('')}</div></div>`; }).join('')}<div class="grid grid-cols-2 gap-4 mt-6 font-black font-black"><button onclick="window.clearAllAvailability()" class="py-4 bg-slate-100 text-slate-400 font-black rounded-2xl uppercase text-[10px] font-black font-black font-black">Limpiar Todo</button><button onclick="window.saveAvailability()" class="py-4 bg-blue-700 text-white font-black rounded-2xl uppercase text-[10px] font-black shadow-lg font-black font-black font-black">Guardar Horarios</button></div></div>`}</div><div class="lg:col-span-5 space-y-6 font-black font-black font-black"><h2 class="text-xs font-black uppercase text-slate-800 font-black font-black">Mis Designaciones / Check-in</h2>${assignmentCards}</div></div>`;
    }

    function viewTakingExam() {
        const q = state.currentExam.questions[state.examProgress.index];
        const hasVid = q.videoUrl && q.videoUrl.trim() !== "";
        return `<div class="max-w-2xl mx-auto bg-white p-10 rounded-[3rem] border shadow-2xl mt-10 font-black font-black font-black"><div class="flex justify-between items-center mb-10 font-black font-black font-black font-black"><span class="text-[10px] font-black uppercase text-slate-400 font-black font-black font-black">Pregunta ${state.examProgress.index + 1}/${state.currentExam.questions.length}</span>${state.examProgress.videoFinished || !hasVid ? `<div class="bg-red-50 px-4 py-1 rounded-full font-black font-black font-black font-black font-black"><span id="exam-timer" class="text-lg font-black text-red-600 font-black font-black font-black font-black font-black">${state.examProgress.timeLeft}</span> <span class="text-[10px] font-black text-red-600 uppercase ml-1 font-black font-black font-black font-black font-black">seg</span></div>` : `<span class="text-[10px] font-black uppercase text-blue-600 animate-pulse font-black font-black font-black font-black font-black font-black font-black font-black">Vea el video para responder</span>`}</div><h3 class="text-xl font-black uppercase text-slate-800 leading-tight mb-8 font-black font-black font-black font-black font-black font-black font-black font-black font-black">${q.text}</h3>${hasVid && !state.examProgress.videoFinished ? `<div class="rounded-2xl overflow-hidden border-4 border-slate-900 bg-black mb-8 aspect-video font-black font-black font-black font-black"><video src="${q.videoUrl}" autoplay controls onended="window.onVideoEnd()" class="w-full h-full font-black font-black font-black font-black font-black"></video></div>` : ''}<div class="grid gap-3 font-black font-black font-black font-black ${hasVid && !state.examProgress.videoFinished ? 'opacity-20 pointer-events-none' : ''}">${q.options.map((opt, i) => `<button onclick="window.submitAnswer(${i})" class="w-full p-6 text-left bg-slate-50 hover:bg-blue-600 hover:text-white rounded-2xl transition-all group font-bold text-xs uppercase font-black font-black font-black font-black font-black font-black font-black font-black font-black"><span class="mr-2 opacity-40 font-black font-black font-black font-black font-black font-black font-black font-black font-black font-black">${String.fromCharCode(65+i)})</span> ${opt}</button>`).join('')}</div></div>`;
    }

    function viewProfile() {
        return `<div class="max-w-md mx-auto bg-white p-12 rounded-[3rem] border shadow-2xl mt-10 font-black font-black font-black font-black font-black"><h2 class="text-center font-black uppercase text-sm mb-10 tracking-widest text-slate-800 font-black font-black font-black font-black">Mi Perfil</h2><div class="space-y-6 text-left font-black font-black font-black font-black font-black"><div><label class="text-[9px] font-black text-slate-400 uppercase ml-1 font-black font-black font-black font-black font-black">Teléfono</label><input type="text" id="prof-phone" value="${state.userData?.phone || ''}" class="w-full p-4 bg-slate-50 border rounded-2xl text-xs font-bold outline-none font-black font-black font-black font-black font-black"></div><div><label class="text-[9px] font-black text-slate-400 uppercase ml-1 font-black font-black font-black font-black font-black font-black">DNI</label><input type="text" id="prof-dni" value="${state.userData?.dni || ''}" class="w-full p-4 bg-slate-50 border rounded-2xl text-xs font-bold outline-none font-black font-black font-black font-black font-black"></div><button onclick="window.saveProfile()" class="w-full py-4 bg-slate-900 text-white font-black rounded-2xl uppercase text-[10px] tracking-widest font-black font-black font-black font-black font-black font-black">Actualizar Datos</button><button onclick="state.view='home';render();" class="w-full text-[9px] font-black text-slate-300 uppercase font-black font-black font-black font-black font-black font-black">Volver</button></div></div>`;
    }




    function render() {
        const app = document.getElementById('app');
        if (!app) return;
        if (!state.currentUser) { app.innerHTML = viewLogin(); return; }
        if (!state.userData) {
            app.innerHTML = `<div class="flex items-center justify-center min-h-screen font-black text-slate-400 animate-pulse uppercase">CARGANDO...</div>`;
            return;
        }
        const isAdmin = state.userData.role?.toLowerCase() === 'admin';
        
        let content = "";
        if (state.view === 'settlement' && isAdmin) {
            content = viewSettlement();
        } else if (state.view === 'profile') {
            content = viewProfile();
        } else if (isAdmin) {
            content = viewAdmin();
        }
         else if (isAdmin) {
            content = viewAdmin();
        } else {
            content = viewReferee();
        }

        app.innerHTML = viewNavbar() + `<div class="max-w-6xl mx-auto p-3 sm:p-6">${content}</div>`;
    }



render();