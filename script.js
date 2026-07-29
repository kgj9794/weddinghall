// 비밀 토큰 (GAS의 SECRET_TOKEN과 일치해야 함)
const AUTH_TOKEN = "wedding_tour_secret_2026";

const GAS_URL = "https://script.google.com/macros/s/AKfycbz5fig_p34TbGLs3GzgggjRj4xtrQEHu3DBGwD0GZOUhHIvxKiyw7qwloZ4PhaXgmqq1g/exec";

let currentDbData = {};
let activeHallId = null;
let autoCloseInterval = null;
let targetWeddingDate = null;

// 확대 및 이동 좌표 상태 관리
let currentZoomScale = 1.0;
let currentTranslateX = 0;
let currentTranslateY = 0;
let currentZoomIndex = 0;

// 핀치 줌 및 자유 이동 제스처 감지 변수
let initialPinchDistance = 0;
let initialScale = 1.0;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let initialTranslateX = 0;
let initialTranslateY = 0;

document.addEventListener("DOMContentLoaded", function() {
    initTheme();          // 야간 시간대 다크모드 자동 초기화
    checkAuth();           // 🔒 인증 확인 후 데이터 로드 진입
    initZoomKeyNav();      // 확대 모달 키보드 단축키 지원
    initPinchZoom();       // 🤌 핀치 투 줌 및 자유 드래그 이동 기능 초기화
    initHistoryNav();      // 📱 안드로이드 뒤로가기 버튼(History API) 연동 초기화
    initCountdownTimer();  // 💍 실시간 D-Day 타이머 시작
});

// ----------------------------------
// 💍 실시간 D-Day 카운트다운 타이머
// ----------------------------------
function initCountdownTimer() {
    updateCountdown();
    setInterval(updateCountdown, 1000);
}

function updateCountdown() {
    const displayEl = document.getElementById("dday-text");
    if (!displayEl) return;

    if (!targetWeddingDate) {
        displayEl.innerText = "💍 결혼 예정일을 설정해 주세요";
        return;
    }

    const targetTime = new Date(targetWeddingDate).getTime();
    if (isNaN(targetTime)) {
        displayEl.innerText = "💍 결혼 예정일을 설정해 주세요";
        return;
    }

    const now = new Date().getTime();
    const diff = targetTime - now;

    if (diff <= 0) {
        displayEl.innerText = "🎉 축하합니다! D-Day 오늘이 결혼식입니다! 💍";
        return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((diff / (1000 * 60)) % 60);
    const seconds = Math.floor((diff / 1000) % 60);

    const padH = String(hours).padStart(2, '0');
    const padM = String(minutes).padStart(2, '0');
    const padS = String(seconds).padStart(2, '0');

    displayEl.innerText = `💍 D-${days} (${days}일 ${padH}시간 ${padM}분 ${padS}초 남음)`;
}

function openWeddingDateModal() {
    pushModalState("wedding-date-modal");
    const input = document.getElementById("wedding-date-input");
    if (input && targetWeddingDate) {
        input.value = sanitizeDatetimeLocal(targetWeddingDate);
    }
    document.getElementById("wedding-date-modal").classList.remove("hidden");
    updateBodyScroll();
}

function closeWeddingDateModal() {
    closeModal("wedding-date-modal");
}

function saveWeddingDate() {
    const input = document.getElementById("wedding-date-input");
    if (!input || !input.value) {
        alert("결혼 예정일을 선택해 주세요.");
        return;
    }

    const dateVal = input.value;
    targetWeddingDate = dateVal;
    localStorage.setItem("wedding_date_cache", dateVal);

    updateCountdown();

    const payload = {
        authToken: AUTH_TOKEN,
        action: "saveWeddingDate",
        weddingDate: dateVal
    };

    fetch(GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === "success") {
            alert("💍 결혼 예정일이 정상적으로 DB에 저장되었습니다.");
        }
    })
    .catch(err => {
        console.error("D-Day 저장 실패:", err);
    });

    closeWeddingDateModal();
}

// ----------------------------------
// 📱 안드로이드 뒤로가기 버튼(History API) 통합 관리
// ----------------------------------
function initHistoryNav() {
    window.addEventListener("popstate", function(event) {
        closeTopModalUI();
    });
}

function pushModalState(modalId) {
    history.pushState({ openModal: modalId }, "");
}

function closeModal(modalId) {
    if (history.state && history.state.openModal) {
        history.back();
    } else {
        closeTopModalUI();
    }
}

function closeTopModalUI() {
    const zoomModal = document.getElementById("zoom-modal");
    const photoModal = document.getElementById("photo-modal");
    const mapModal = document.getElementById("map-modal");
    const recommendModal = document.getElementById("recommend-modal");
    const weddingDateModal = document.getElementById("wedding-date-modal");
    const conditionsModal = document.getElementById("conditions-modal");
    const overviewModal = document.getElementById("overview-modal");

    if (zoomModal && !zoomModal.classList.contains("hidden")) {
        zoomModal.classList.add("hidden");
        resetZoom();
    } else if (photoModal && !photoModal.classList.contains("hidden")) {
        photoModal.classList.add("hidden");
        activeHallId = null;
    } else if (mapModal && !mapModal.classList.contains("hidden")) {
        mapModal.classList.add("hidden");
    } else if (recommendModal && !recommendModal.classList.contains("hidden")) {
        recommendModal.classList.add("hidden");
    } else if (weddingDateModal && !weddingDateModal.classList.contains("hidden")) {
        weddingDateModal.classList.add("hidden");
    } else if (conditionsModal && !conditionsModal.classList.contains("hidden")) {
        conditionsModal.classList.add("hidden");
        if (autoCloseInterval) clearInterval(autoCloseInterval);
    } else if (overviewModal && !overviewModal.classList.contains("hidden")) {
        overviewModal.classList.add("hidden");
    }
    updateBodyScroll();
}

// ----------------------------------
// 🔒 접속 비밀번호 서버 인증 및 화면 격리
// ----------------------------------
function checkAuth() {
    const isAuthed = localStorage.getItem("wedding_tour_authed");
    const overlay = document.getElementById("password-overlay");
    const mainContent = document.getElementById("main-content");
    
    if (isAuthed === "true") {
        if (overlay) overlay.classList.add("hidden");
        if (mainContent) mainContent.classList.remove("hidden");
        
        updateBodyScroll();
        loadFromLocalStorage();
        
        const loader = document.getElementById("loader");
        if (loader) loader.classList.remove("hidden");
        loadReservations();
    } else {
        if (mainContent) mainContent.classList.add("hidden");
        if (overlay) {
            overlay.classList.remove("hidden");
            updateBodyScroll();
            setTimeout(() => {
                const input = document.getElementById("app-password-input");
                if (input) input.focus();
            }, 100);
        }
    }
}

function verifyPassword() {
    const input = document.getElementById("app-password-input");
    const errorMsg = document.getElementById("password-error");

    if (!input || !input.value.trim()) {
        if (errorMsg) errorMsg.innerText = "비밀번호를 입력해 주세요.";
        return;
    }

    if (errorMsg) {
        errorMsg.style.color = "var(--primary-color)";
        errorMsg.innerText = "⏳ 비밀번호 확인 중...";
    }

    const payload = {
        action: "verifyPassword",
        password: input.value
    };

    fetch(GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === "success") {
            localStorage.setItem("wedding_tour_authed", "true");
            if (errorMsg) errorMsg.innerText = "";
            input.value = "";
            checkAuth();
        } else {
            if (errorMsg) {
                errorMsg.style.color = "#d32f2f";
                errorMsg.innerText = "❌ " + (data.message || "비밀번호가 올바르지 않습니다.");
            }
            input.value = "";
            input.focus();
        }
    })
    .catch(err => {
        if (errorMsg) {
            errorMsg.style.color = "#d32f2f";
            errorMsg.innerText = "⚠️ 서버 연결 실패. 다시 시도해 주세요.";
        }
        console.error(err);
    });
}

// ----------------------------------
// 라이트 / 다크모드 관리 (자동 감지)
// ----------------------------------
function initTheme() {
    const savedTheme = localStorage.getItem("wedding_tour_theme");
    if (savedTheme) {
        setTheme(savedTheme);
    } else {
        const currentHour = new Date().getHours();
        const isNight = currentHour >= 19 || currentHour < 7;
        setTheme(isNight ? "dark" : "light");
    }
}

function setTheme(theme) {
    if (theme === "dark") {
        document.documentElement.setAttribute("data-theme", "dark");
    } else {
        document.documentElement.removeAttribute("data-theme");
    }
}

// 🛑 팝업/잠금창 열림 시 배경 메인 화면 스크롤 완전 차단
function updateBodyScroll() {
    const isLocked = !document.getElementById("password-overlay")?.classList.contains("hidden");
    const hasVisibleModal = document.querySelector('.modal-overlay:not(.hidden), .zoom-overlay:not(.hidden)');
    
    if (isLocked || hasVisibleModal) {
        document.body.classList.add("modal-open");
    } else {
        document.body.classList.remove("modal-open");
    }
}

function saveToLocalStorage(data) {
    try {
        localStorage.setItem("wedding_tour_cache", JSON.stringify(data));
    } catch (e) {
        console.warn("LocalStorage 저장 실패", e);
    }
}

function loadFromLocalStorage() {
    try {
        const cachedDate = localStorage.getItem("wedding_date_cache");
        if (cachedDate) {
            targetWeddingDate = cachedDate;
            updateCountdown();
        }

        const cached = localStorage.getItem("wedding_tour_cache");
        if (cached) {
            const data = JSON.parse(cached);
            ["thesaint", "verde", "dmc", "worldcup"].forEach(id => {
                if (data[id]) {
                    let rDate = typeof data[id] === 'object' ? data[id].reservedAt : data[id];
                    let rMemo = typeof data[id] === 'object' ? data[id].memo : "";
                    let rImgs = typeof data[id] === 'object' ? (data[id].images || []) : [];
                    setSavedState(id, rDate, rMemo, rImgs);
                }
            });
        }
    } catch (e) {
        console.warn("LocalStorage 캐시 읽기 실패", e);
    }
}

function hideLoader() {
    const barFill = document.getElementById("progress-bar-fill");
    const loader = document.getElementById("loader");
    
    if (barFill) {
        barFill.style.animation = "none";
        barFill.style.width = "100%";
    }
    
    setTimeout(() => {
        if (loader) loader.classList.add("hidden");
        checkInitialConditionsPopup();
    }, 200);
}

function sanitizeDatetimeLocal(dateTimeStr) {
    if (!dateTimeStr) return "";
    if (typeof dateTimeStr !== 'string') dateTimeStr = String(dateTimeStr);
    
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(dateTimeStr)) {
        return dateTimeStr.substring(0, 16);
    }
    
    let d = new Date(dateTimeStr);
    if (!isNaN(d.getTime())) {
        let yyyy = d.getFullYear();
        let mm = String(d.getMonth() + 1).padStart(2, '0');
        let dd = String(d.getDate()).padStart(2, '0');
        let hh = String(d.getHours()).padStart(2, '0');
        let min = String(d.getMinutes()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
    }
    return "";
}

function formatKoreanDateTime(dateTimeStr) {
    let cleanStr = sanitizeDatetimeLocal(dateTimeStr);
    if (!cleanStr) return dateTimeStr;

    const [datePart, timePart] = cleanStr.split("T");
    if (!datePart || !timePart) return cleanStr;

    const [year, month, day] = datePart.split("-");
    let [hours, minutes] = timePart.split(":");

    let h = parseInt(hours, 10);
    const ampm = h >= 12 ? "오후" : "오전";
    h = h % 12;
    if (h === 0) h = 12;

    const formattedHours = String(h).padStart(2, '0');
    return `${year}년 ${month}월 ${day}일 ${ampm} ${formattedHours}시 ${minutes}분`;
}

function setSavedState(hallId, dateVal, memoVal, imgArr) {
    let images = Array.isArray(imgArr) ? imgArr : [];
    currentDbData[hallId] = { 
        reservedAt: dateVal, 
        memo: memoVal, 
        images: images
    };

    const inputDate = document.getElementById("date-" + hallId);
    const inputMemo = document.getElementById("memo-" + hallId);
    const textDate = document.getElementById("text-" + hallId);
    const textMemo = document.getElementById("memo-text-" + hallId);
    const box = document.getElementById("box-" + hallId);
    const badgeCount = document.getElementById("badge-count-" + hallId);
    
    const viewDiv = document.getElementById("view-" + hallId);
    const editDiv = document.getElementById("edit-" + hallId);
    const status = document.getElementById("status-" + hallId);

    if (badgeCount) badgeCount.innerText = images.length;

    let cleanDateVal = sanitizeDatetimeLocal(dateVal);
    if (inputDate) inputDate.value = cleanDateVal;
    if (inputMemo) inputMemo.value = memoVal || "";

    if (textDate) {
        textDate.innerText = cleanDateVal ? formatKoreanDateTime(cleanDateVal) : "일시 미지정";
    }

    if (textMemo) {
        if (memoVal && memoVal.trim() !== "") {
            textMemo.innerText = memoVal;
            textMemo.style.display = "block";
        } else {
            textMemo.innerText = "";
            textMemo.style.display = "none";
        }
    }

    if (box) {
        box.classList.add("is-saved");
        if (cleanDateVal) {
            box.classList.add("has-date");
        } else {
            box.classList.remove("has-date");
        }
    }

    if (viewDiv) viewDiv.style.display = "flex";
    if (editDiv) editDiv.style.display = "none";
    if (status) status.innerText = "";
}

function enableEdit(hallId) {
    const viewDiv = document.getElementById("view-" + hallId);
    const editDiv = document.getElementById("edit-" + hallId);
    const status = document.getElementById("status-" + hallId);
    const box = document.getElementById("box-" + hallId);

    if (box) {
        box.classList.remove("is-saved");
        box.classList.remove("has-date");
    }

    if (viewDiv) viewDiv.style.display = "none";
    if (editDiv) editDiv.style.display = "flex";
    if (status) {
        status.innerText = "일시/메모 수정 후 저장을 눌러주세요.";
        status.style.color = "var(--primary-color)";
    }
}

function loadReservations() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    fetch(GAS_URL + "?action=get", { signal: controller.signal })
        .then(res => {
            clearTimeout(timeoutId);
            return res.json();
        })
        .then(data => {
            if (data.weddingDate) {
                targetWeddingDate = data.weddingDate;
                localStorage.setItem("wedding_date_cache", data.weddingDate);
                updateCountdown();
            }

            ["thesaint", "verde", "dmc", "worldcup"].forEach(id => {
                if (data[id]) {
                    let rDate = data[id].reservedAt || "";
                    let rMemo = data[id].memo || "";
                    let rImgs = data[id].images || [];
                    setSavedState(id, rDate, rMemo, rImgs);
                } else {
                    if (!currentDbData[id] || (!currentDbData[id].reservedAt && !currentDbData[id].memo)) {
                        document.getElementById("edit-" + id).style.display = "flex";
                        document.getElementById("view-" + id).style.display = "none";
                    }
                }
            });
            saveToLocalStorage(currentDbData);
        })
        .catch(err => {
            console.warn("DB 연결 지연으로 로컬 데이터 사용:", err.name);
        })
        .finally(() => {
            hideLoader();
        });
}

function syncDataToDb(hallId, statusElement) {
    const hallData = currentDbData[hallId] || { reservedAt: "", memo: "", images: [] };

    saveToLocalStorage(currentDbData);

    if (statusElement) {
        statusElement.innerText = "DB에 저장 중...";
        statusElement.style.color = "var(--primary-color)";
    }

    const payload = {
        authToken: AUTH_TOKEN,
        action: "save",
        hallId: hallId,
        reservedAt: hallData.reservedAt || "",
        memo: hallData.memo || "",
        images: hallData.images || []
    };

    fetch(GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === "success") {
            if (statusElement) {
                statusElement.innerText = "✅ 성공적으로 저장되었습니다.";
                statusElement.style.color = "#2e7d32";
            }
        } else {
            if (statusElement) {
                statusElement.innerText = "⚠️ 시트 저장 지연 (로컬 저장 완료)";
                statusElement.style.color = "#d32f2f";
            }
        }
    })
    .catch(err => {
        if (statusElement) {
            statusElement.innerText = "⚠️ 시트 연결 지연 (로컬 저장 완료)";
            statusElement.style.color = "#d32f2f";
        }
        console.error(err);
    });
}

function saveReservation(hallId) {
    const inputDate = document.getElementById("date-" + hallId);
    const inputMemo = document.getElementById("memo-" + hallId);
    const status = document.getElementById("status-" + hallId);

    const dateVal = inputDate.value;
    const memoVal = inputMemo.value;
    const existingImgs = (currentDbData[hallId] && currentDbData[hallId].images) ? currentDbData[hallId].images : [];

    if (!dateVal && (!memoVal || memoVal.trim() === "")) {
        alert("일시 또는 메모를 입력해 주세요.");
        return;
    }

    setSavedState(hallId, dateVal, memoVal, existingImgs);
    syncDataToDb(hallId, status);
}

// ----------------------------------
// ✨ 제미나이 추천 모달 관리
// ----------------------------------
function openRecommendModal() {
    pushModalState("recommend-modal");
    document.getElementById("recommend-modal").classList.remove("hidden");
    updateBodyScroll();
}

function closeRecommendModal() {
    closeModal("recommend-modal");
}

// ----------------------------------
// 🗺️ 구글 지도 모달 관리
// ----------------------------------
function openMapModal() {
    pushModalState("map-modal");
    document.getElementById("map-modal").classList.remove("hidden");
    updateBodyScroll();
}

function closeMapModal() {
    closeModal("map-modal");
}

// ----------------------------------
// 견적 사진 모달 & 업로드/삭제/확대
// ----------------------------------
function openPhotoModal(hallId, hallName) {
    pushModalState("photo-modal");
    activeHallId = hallId;
    document.getElementById("photo-modal-title").innerText = `📄 ${hallName} 견적서 사진`;
    document.getElementById("photo-status-msg").innerText = "";
    renderPhotoSlider();
    document.getElementById("photo-modal").classList.remove("hidden");
    updateBodyScroll();
}

function closePhotoModal() {
    closeModal("photo-modal");
}

function renderPhotoSlider() {
    const slider = document.getElementById("photo-slider");
    slider.innerHTML = "";

    const images = (currentDbData[activeHallId] && currentDbData[activeHallId].images) ? currentDbData[activeHallId].images : [];

    const badgeCount = document.getElementById("badge-count-" + activeHallId);
    if (badgeCount) badgeCount.innerText = images.length;

    if (images.length === 0) {
        slider.innerHTML = `<div class="photo-empty-msg">등록된 견적서 사진이 없습니다.<br>위의 [+ 사진 추가] 버튼을 눌러 사진을 등록해 보세요!</div>`;
        return;
    }

    images.forEach((imgUrl, idx) => {
        const card = document.createElement("div");
        card.className = "photo-slide-card";
        card.innerHTML = `
            <img src="${imgUrl}" alt="견적서 ${idx+1}" onclick="openZoomModal(${idx})">
            <button class="btn-delete-photo" onclick="deletePhoto(${idx})">🗑️ 삭제 (${idx+1}/${images.length})</button>
        `;
        slider.appendChild(card);
    });
}

function compressImage(file, maxWidth = 1000, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onerror = error => reject(error);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onerror = error => reject(error);
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }
                } else {
                    if (height > maxWidth) {
                        width = Math.round((width * maxWidth) / height);
                        height = maxWidth;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                const dataUrl = canvas.toDataURL('image/jpeg', quality);
                resolve(dataUrl.split(',')[1]);
            };
        };
    });
}

async function handleFileUpload(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const statusMsg = document.getElementById("photo-status-msg");
    statusMsg.innerText = "⏳ 사진 압축 및 업로드 중...";
    statusMsg.style.color = "var(--primary-color)";

    if (!currentDbData[activeHallId]) {
        currentDbData[activeHallId] = { reservedAt: "", memo: "", images: [] };
    }
    if (!currentDbData[activeHallId].images) {
        currentDbData[activeHallId].images = [];
    }

    try {
        const totalFiles = files.length;
        for (let i = 0; i < totalFiles; i++) {
            statusMsg.innerText = `⏳ 사진 업로드 중 (${i + 1}/${totalFiles})...`;
            
            const pureBase64 = await compressImage(files[i]);
            
            const payload = {
                authToken: AUTH_TOKEN,
                action: "uploadImage",
                base64: pureBase64
            };

            const res = await fetch(GAS_URL, {
                method: "POST",
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify(payload)
            });

            const result = await res.json();
            
            if (result.status === "success" && result.url) {
                currentDbData[activeHallId].images.push(result.url);
                renderPhotoSlider();
            } else {
                throw new Error(result.message || "업로드 실패");
            }
        }

        syncDataToDb(activeHallId, statusMsg);
    } catch (err) {
        console.error("Upload error:", err);
        statusMsg.innerText = "❌ 업로드 실패: " + err.message;
        statusMsg.style.color = "#d32f2f";
    } finally {
        event.target.value = "";
    }
}

function deletePhoto(index) {
    if (!confirm("정말 지우시겠습니까?")) return;

    const statusMsg = document.getElementById("photo-status-msg");
    if (currentDbData[activeHallId] && currentDbData[activeHallId].images) {
        currentDbData[activeHallId].images.splice(index, 1);
        renderPhotoSlider();
        syncDataToDb(activeHallId, statusMsg);
    }
}

// ----------------------------------
// 🔍 고화질 확대 뷰어 & 자유 이동(Pan)
// ----------------------------------
function applyZoomTransform() {
    const zoomImg = document.getElementById("zoom-img");
    if (zoomImg) {
        zoomImg.style.transform = `translate(${currentTranslateX}px, ${currentTranslateY}px) scale(${currentZoomScale})`;
    }
}

function resetZoom() {
    currentZoomScale = 1.0;
    currentTranslateX = 0;
    currentTranslateY = 0;
    applyZoomTransform();
}

function openZoomModal(index = 0) {
    if (!activeHallId || !currentDbData[activeHallId] || !currentDbData[activeHallId].images) return;
    
    pushModalState("zoom-modal");
    currentZoomIndex = index;
    updateZoomView();

    document.getElementById("zoom-modal").classList.remove("hidden");
    updateBodyScroll();
}

function updateZoomView() {
    const images = (currentDbData[activeHallId] && currentDbData[activeHallId].images) ? currentDbData[activeHallId].images : [];
    if (images.length === 0) {
        closeZoomModal();
        return;
    }

    if (currentZoomIndex < 0) currentZoomIndex = images.length - 1;
    if (currentZoomIndex >= images.length) currentZoomIndex = 0;

    const zoomImg = document.getElementById("zoom-img");
    const counter = document.getElementById("zoom-counter");
    const prevBtn = document.getElementById("zoom-prev-btn");
    const nextBtn = document.getElementById("zoom-next-btn");

    zoomImg.src = images[currentZoomIndex];
    resetZoom();

    if (counter) counter.innerText = `${currentZoomIndex + 1} / ${images.length}`;

    if (images.length <= 1) {
        if (prevBtn) prevBtn.style.display = "none";
        if (nextBtn) nextBtn.style.display = "none";
    } else {
        if (prevBtn) prevBtn.style.display = "flex";
        if (nextBtn) nextBtn.style.display = "flex";
    }
}

function prevZoomImage(event) {
    if (event) event.stopPropagation();
    currentZoomIndex--;
    updateZoomView();
}

function nextZoomImage(event) {
    if (event) event.stopPropagation();
    currentZoomIndex++;
    updateZoomView();
}

function closeZoomModal() {
    closeModal("zoom-modal");
}

function toggleZoomIn(event) {
    if (currentZoomScale === 1.0) {
        currentZoomScale = 2.0;
    } else {
        resetZoom();
        return;
    }
    applyZoomTransform();
}

// 🤌 핀치 투 줌 및 확대 상태 손가락/마우스 자유 드래그 이동
function initPinchZoom() {
    const wrapper = document.querySelector(".zoom-img-wrapper");
    const zoomImg = document.getElementById("zoom-img");

    if (!wrapper || !zoomImg) return;

    wrapper.addEventListener("touchstart", function(e) {
        if (e.touches.length === 2) {
            isDragging = false;
            initialPinchDistance = getTouchDistance(e.touches);
            initialScale = currentZoomScale;
        } else if (e.touches.length === 1 && currentZoomScale > 1.0) {
            isDragging = true;
            dragStartX = e.touches[0].clientX;
            dragStartY = e.touches[0].clientY;
            initialTranslateX = currentTranslateX;
            initialTranslateY = currentTranslateY;
        }
    }, { passive: true });

    wrapper.addEventListener("touchmove", function(e) {
        if (e.touches.length === 2 && initialPinchDistance > 0) {
            const currentDistance = getTouchDistance(e.touches);
            if (currentDistance > 0) {
                let newScale = initialScale * (currentDistance / initialPinchDistance);
                newScale = Math.max(1.0, Math.min(newScale, 4.0));
                currentZoomScale = newScale;
                
                if (currentZoomScale === 1.0) {
                    currentTranslateX = 0;
                    currentTranslateY = 0;
                }
                applyZoomTransform();
            }
        } else if (e.touches.length === 1 && isDragging && currentZoomScale > 1.0) {
            const deltaX = e.touches[0].clientX - dragStartX;
            const deltaY = e.touches[0].clientY - dragStartY;
            currentTranslateX = initialTranslateX + deltaX;
            currentTranslateY = initialTranslateY + deltaY;
            applyZoomTransform();
        }
    }, { passive: true });

    wrapper.addEventListener("touchend", function(e) {
        if (e.touches.length < 2) initialPinchDistance = 0;
        if (e.touches.length === 0) isDragging = false;
    }, { passive: true });

    zoomImg.addEventListener("mousedown", function(e) {
        if (currentZoomScale > 1.0) {
            isDragging = true;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            initialTranslateX = currentTranslateX;
            initialTranslateY = currentTranslateY;
            e.preventDefault();
        }
    });

    window.addEventListener("mousemove", function(e) {
        if (isDragging && currentZoomScale > 1.0) {
            const deltaX = e.clientX - dragStartX;
            const deltaY = e.clientY - dragStartY;
            currentTranslateX = initialTranslateX + deltaX;
            currentTranslateY = initialTranslateY + deltaY;
            applyZoomTransform();
        }
    });

    window.addEventListener("mouseup", function() {
        isDragging = false;
    });
}

function getTouchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

// 키보드 방향키 탐색 기능 (PC 대응)
function initZoomKeyNav() {
    document.addEventListener("keydown", function(e) {
        const zoomModal = document.getElementById("zoom-modal");
        if (zoomModal && !zoomModal.classList.contains("hidden")) {
            if (e.key === "ArrowLeft") {
                prevZoomImage();
            } else if (e.key === "ArrowRight") {
                nextZoomImage();
            } else if (e.key === "Escape") {
                closeZoomModal();
            }
        }
    });
}

// ----------------------------------
// 조건 보기 & 한눈에 보기
// ----------------------------------
function checkInitialConditionsPopup() {
    const todayStr = new Date().toDateString();
    const hideUntil = localStorage.getItem("conditions_hide_today");

    if (hideUntil !== todayStr) {
        openConditionsModal(true);
    }
}

function openConditionsModal(isAutoClose = false) {
    pushModalState("conditions-modal");
    const msgEl = document.getElementById("auto-close-msg");
    document.getElementById("conditions-modal").classList.remove("hidden");
    updateBodyScroll();
    
    if (autoCloseInterval) clearInterval(autoCloseInterval);

    if (isAutoClose) {
        let secondsLeft = 5;
        msgEl.innerText = `⏳ ${secondsLeft}초 뒤에 해당 창이 닫혀요`;
        msgEl.style.display = "block";

        autoCloseInterval = setInterval(() => {
            secondsLeft--;
            if (secondsLeft > 0) {
                msgEl.innerText = `⏳ ${secondsLeft}초 뒤에 해당 창이 닫혀요`;
            } else {
                closeConditionsModal();
            }
        }, 1000);
    } else {
        msgEl.style.display = "none";
    }
}

function closeConditionsModal() {
    closeModal("conditions-modal");
}

function hideConditionsToday() {
    const todayStr = new Date().toDateString();
    localStorage.setItem("conditions_hide_today", todayStr);
    closeConditionsModal();
}

// 한눈에 보기 모달
function openOverviewModal() {
    pushModalState("overview-modal");
    const container = document.getElementById("overview-list");
    container.innerHTML = "";

    const halls = [
        { id: 'thesaint', name: '1순위 : 더세인트' },
        { id: 'verde', name: '2순위 : 더베르G' },
        { id: 'dmc', name: '3순위 : DMC타워' },
        { id: 'worldcup', name: '4순위 : 월드컵컨벤션' }
    ];

    halls.forEach(hall => {
        const data = currentDbData[hall.id];
        const dateVal = data ? data.reservedAt : "";
        const memoVal = data ? data.memo : "";
        const images = data && Array.isArray(data.images) ? data.images : [];
        const imgCount = images.length;
        const hasDate = !!dateVal;
        const hasData = hasDate || (memoVal && memoVal.trim() !== "") || imgCount > 0;

        const card = document.createElement("div");
        let cardClass = "overview-card";
        if (hasDate) {
            cardClass += " has-date";
        } else if (hasData) {
            cardClass += " has-data";
        }
        card.className = cardClass;

        let formattedDate = dateVal ? formatKoreanDateTime(dateVal) : "일정 미정";
        let memoHtml = memoVal && memoVal.trim() !== "" ? `<div class="overview-memo">${memoVal}</div>` : "";
        
        let imgHtml = "";
        if (imgCount > 0) {
            imgHtml = `
                <div>
                    <button class="overview-photo-btn" onclick="closeOverviewModal(); openPhotoModal('${hall.id}', '${hall.name}');">
                        📷 견적 사진 ${imgCount}장 (클릭 시 사진 목록) →
                    </button>
                </div>
            `;
        } else {
            imgHtml = `<div style="font-size:0.78rem; color:var(--text-sub); margin-top:4px;">📷 등록된 견적 사진 없음</div>`;
        }

        card.innerHTML = `
            <div class="overview-title">${hall.name}</div>
            <div class="overview-date">${formattedDate}</div>
            ${memoHtml}
            ${imgHtml}
        `;
        container.appendChild(card);
    });

    document.getElementById("overview-modal").classList.remove("hidden");
    updateBodyScroll();
}

function closeOverviewModal() {
    closeModal("overview-modal");
}
