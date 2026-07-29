// 비밀 토큰 (GAS의 SECRET_TOKEN과 일치해야 함)
const AUTH_TOKEN = "wedding_tour_secret_2026";

const GAS_URL = "https://script.google.com/macros/s/AKfycbz5fig_p34TbGLs3GzgggjRj4xtrQEHu3DBGwD0GZOUhHIvxKiyw7qwloZ4PhaXgmqq1g/exec";

let currentDbData = {};
let activeHallId = null;
let autoCloseInterval = null;
let currentZoomScale = 1.0;

document.addEventListener("DOMContentLoaded", function() {
    initTheme(); // 시간 및 저장값 기반 다크모드 초기화
    loadFromLocalStorage();
    loadReservations();
});

// ----------------------------------
// 라이트 / 다크모드 테마 관리
// ----------------------------------
function initTheme() {
    const savedTheme = localStorage.getItem("wedding_tour_theme");
    if (savedTheme) {
        setTheme(savedTheme);
    } else {
        // 저녁시간 (19시 ~ 07시) 일 때 다크모드 자동 설정
        const currentHour = new Date().getHours();
        const isNight = currentHour >= 19 || currentHour < 7;
        setTheme(isNight ? "dark" : "light");
    }
}

function setTheme(theme) {
    const btn = document.getElementById("theme-toggle-btn");
    if (theme === "dark") {
        document.documentElement.setAttribute("data-theme", "dark");
        if (btn) btn.innerText = "☀️ 라이트모드";
    } else {
        document.documentElement.removeAttribute("data-theme");
        if (btn) btn.innerText = "🌙 다크모드";
    }
}

function toggleTheme() {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const newTheme = isDark ? "light" : "dark";
    localStorage.setItem("wedding_tour_theme", newTheme);
    setTheme(newTheme);
}

// 팝업 열림 시 배경 메인 화면 스크롤 제어
function updateBodyScroll() {
    const hasVisibleModal = document.querySelector('.modal-overlay:not(.hidden), .zoom-overlay:not(.hidden)');
    if (hasVisibleModal) {
        document.body.style.overflow = 'hidden';
    } else {
        document.body.style.overflow = '';
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
    currentDbData[hallId] = { reservedAt: dateVal, memo: memoVal, images: images };

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

    if (box) box.classList.add("is-saved");

    if (viewDiv) viewDiv.style.display = "flex";
    if (editDiv) editDiv.style.display = "none";
    if (status) status.innerText = "";
}

function enableEdit(hallId) {
    const viewDiv = document.getElementById("view-" + hallId);
    const editDiv = document.getElementById("edit-" + hallId);
    const status = document.getElementById("status-" + hallId);
    const box = document.getElementById("box-" + hallId);

    if (box) box.classList.remove("is-saved");

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
// 견적 사진 모달 & 업로드/삭제/확대
// ----------------------------------
function openPhotoModal(hallId, hallName) {
    activeHallId = hallId;
    document.getElementById("photo-modal-title").innerText = `📄 ${hallName} 견적서 사진`;
    document.getElementById("photo-status-msg").innerText = "";
    renderPhotoSlider();
    document.getElementById("photo-modal").classList.remove("hidden");
    updateBodyScroll();
}

function closePhotoModal() {
    document.getElementById("photo-modal").classList.add("hidden");
    activeHallId = null;
    updateBodyScroll();
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
            <img src="${imgUrl}" alt="견적서 ${idx+1}" onclick="openZoomModal('${imgUrl}')">
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

// 다중 및 중복 선택 업로드 지원
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
                renderPhotoSlider(); // 1장씩 완료되는 대로 즉시 슬라이더 갱신
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
        // 파일 선택 인풋 초기화 -> 같은 사진을 다시 선택해도 onChange 이벤트 발생
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

// 고화질 Zoom 확대 뷰어
function openZoomModal(imgSrc) {
    const zoomImg = document.getElementById("zoom-img");
    zoomImg.src = imgSrc;
    currentZoomScale = 1.0;
    zoomImg.style.transform = `scale(${currentZoomScale})`;
    document.getElementById("zoom-modal").classList.remove("hidden");
    updateBodyScroll();
}

function closeZoomModal() {
    document.getElementById("zoom-modal").classList.add("hidden");
    updateBodyScroll();
}

function toggleZoomIn(event) {
    currentZoomScale = currentZoomScale === 1.0 ? 2.0 : 1.0;
    document.getElementById("zoom-img").style.transform = `scale(${currentZoomScale})`;
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
    if (autoCloseInterval) clearInterval(autoCloseInterval);
    document.getElementById("conditions-modal").classList.add("hidden");
    updateBodyScroll();
}

function hideConditionsToday() {
    const todayStr = new Date().toDateString();
    localStorage.setItem("conditions_hide_today", todayStr);
    closeConditionsModal();
}

// 한눈에 보기 모달
function openOverviewModal() {
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
        const hasData = !!dateVal || (memoVal && memoVal.trim() !== "") || imgCount > 0;

        const card = document.createElement("div");
        card.className = "overview-card " + (hasData ? "has-data" : "");

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
    document.getElementById("overview-modal").classList.add("hidden");
    updateBodyScroll();
}
