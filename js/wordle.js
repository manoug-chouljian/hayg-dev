document.addEventListener("DOMContentLoaded", async () => {
    if (window.HaygAPI) await window.HaygAPI.requireAuth();

    const board = document.getElementById("board");
    const keyboardContainer = document.getElementById("keyboard-container");
    const gameMessage = document.getElementById("game-message");

    let wordLength = 5;

    function getNewWord(len) {
        if (typeof wordleWords !== 'undefined' && wordleWords[len]) {
            const arr = wordleWords[len];
            return arr[Math.floor(Math.random() * arr.length)].trim();
        }
        return targetWords[Math.floor(Math.random() * targetWords.length)].trim();
    }

    let targetWord = getNewWord(wordLength);
    console.log("Target word:", targetWord); // For debugging

    const maxGuesses = 6;

    let currentGuess = [];
    let nextLetter = 0;
    let guessesRemaining = maxGuesses;
    let isGameOver = false;
    let isChecking = false;
    let isGameStarted = false;

    let audioContext;

    function initAudio() {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    function playClickSound() {
        if (!audioContext) initAudio();

        // Typewriter mechanical click (white noise burst through a bandpass filter)
        const bufferSize = audioContext.sampleRate * 0.04; // 40ms buffer
        const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noiseSource = audioContext.createBufferSource();
        noiseSource.buffer = buffer;

        const filter = audioContext.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 2500; // Crisp high-mid frequency
        filter.Q.value = 0.5;

        const gainNode = audioContext.createGain();
        gainNode.gain.setValueAtTime(0.8, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.03);

        noiseSource.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(audioContext.destination);

        noiseSource.start();
    }

    document.addEventListener('click', initAudio, { once: true });

    // Armenian keyboard layout (phonetic style)
    const keys = [
        ['Է', 'Թ', 'Փ', 'Ձ', 'Ջ', 'Ր', 'Չ', 'Ճ', 'Ժ', 'Ծ'],
        ['Ք', 'Ո', 'Ե', 'Ռ', 'Տ', 'Ը', 'Ւ', 'Ի', 'Օ', 'Պ'],
        ['Ա', 'Ս', 'Դ', 'Ֆ', 'Գ', 'Հ', 'Յ', 'Կ', 'Լ'],
        ['⏎', 'Զ', 'Խ', 'Ց', 'Վ', 'Բ', 'Ն', 'Մ', 'Շ', 'Ղ', '⌫']
    ];

    // Flat array for quick lookup
    const allKeys = keys.flat();

    function initBoard() {
        for (let i = 0; i < maxGuesses; i++) {
            let row = document.createElement("div");
            row.className = "tile-row";

            // Adjust max width based on word length
            row.style.gridTemplateColumns = `repeat(${wordLength}, 1fr)`;

            for (let j = 0; j < wordLength; j++) {
                let box = document.createElement("div");
                box.className = "tile";
                box.setAttribute("id", `box-${i}-${j}`);
                row.appendChild(box);
            }
            board.appendChild(row);
        }
    }

    function initKeyboard() {
        for (let row of keys) {
            let keyboardRow = document.createElement("div");
            keyboardRow.className = "keyboard-row";

            for (let key of row) {
                let button = document.createElement("button");
                button.textContent = key;
                button.setAttribute("data-key", key);

                if (key === '⏎' || key === '⌫') {
                    button.classList.add("wide-button");
                }

                button.addEventListener("click", () => handleInput(key));

                // Visual feedback for mobile
                button.addEventListener("touchstart", () => button.classList.add("key-pressed"), { passive: true });
                button.addEventListener("touchend", () => button.classList.remove("key-pressed"), { passive: true });
                button.addEventListener("touchcancel", () => button.classList.remove("key-pressed"), { passive: true });

                keyboardRow.appendChild(button);
            }
            keyboardContainer.appendChild(keyboardRow);
        }
    }

    function handleInput(key) {
        if (!isGameStarted || isGameOver || isChecking) return;

        playClickSound();

        if (key === '⌫' || key === 'Backspace') {
            deleteLetter();
            return;
        }

        if (key === '⏎' || key === 'Enter' || key === 'ENTER' || key === '\r' || key === '\n') {
            checkGuess();
            return;
        }

        let upperKey = key.toUpperCase();
        if (allKeys.includes(upperKey)) {
            insertLetter(upperKey);
        }
    }

    function insertLetter(letter) {
        if (nextLetter === wordLength) return;

        let currentLetterBox = document.getElementById(`box-${maxGuesses - guessesRemaining}-${nextLetter}`);
        currentLetterBox.textContent = letter;
        currentLetterBox.setAttribute("data-state", "active");
        currentLetterBox.classList.add("pop");

        currentGuess.push(letter);
        nextLetter += 1;
    }

    function deleteLetter() {
        if (nextLetter === 0) return;

        let currentLetterBox = document.getElementById(`box-${maxGuesses - guessesRemaining}-${nextLetter - 1}`);
        currentLetterBox.textContent = "";
        currentLetterBox.removeAttribute("data-state");
        currentLetterBox.classList.remove("pop");

        currentGuess.pop();
        nextLetter -= 1;
    }

    function checkGuess() {
        if (currentGuess.length < wordLength) {
            console.log("Guess too short:", currentGuess.length, "expected:", wordLength);
            showMessage("Բառը շատ կարճ է");
            return;
        }

        isChecking = true;
        let guessString = currentGuess.join("");
        let currentRow = maxGuesses - guessesRemaining;

        // No dictionary validation requested, accept any 5 letters

        // Color the boxes
        let targetWordArr = targetWord.split("");
        let guessArr = [...currentGuess];
        let colors = new Array(wordLength).fill("absent");

        // First pass: find correct letters
        for (let i = 0; i < wordLength; i++) {
            if (guessArr[i] === targetWordArr[i]) {
                colors[i] = "correct";
                targetWordArr[i] = null; // Mark as handled
                guessArr[i] = null;
            }
        }

        // Second pass: find present letters
        for (let i = 0; i < wordLength; i++) {
            if (guessArr[i] === null) continue;

            let targetIndex = targetWordArr.indexOf(guessArr[i]);
            if (targetIndex !== -1) {
                colors[i] = "present";
                targetWordArr[targetIndex] = null; // Mark as handled
            }
        }

        // Apply colors and animations
        let delay = 0;
        for (let i = 0; i < wordLength; i++) {
            let box = document.getElementById(`box-${currentRow}-${i}`);
            let letter = currentGuess[i];

            setTimeout(() => {
                box.classList.add("flip");
                box.setAttribute("data-state", colors[i]);
                updateKeyboardColor(letter, colors[i]);
            }, delay);
            delay += 250;
        }

        // Check win/loss
        setTimeout(() => {
            isChecking = false;
            if (guessString === targetWord) {
                isGameOver = true;
                const scoreEarned = 100 + (guessesRemaining * 50);
                if (window.HaygAPI) window.HaygAPI.updateScore('wordle', scoreEarned);
                setTimeout(() => showEndOverlay(`Շնորհաւոր, յաղթեցիր:`), 500);
            } else {
                guessesRemaining -= 1;
                currentGuess = [];
                nextLetter = 0;

                if (guessesRemaining === 0) {
                    isGameOver = true;
                    setTimeout(() => showEndOverlay(`Աւարտ։ Բառն էր՝ ${targetWord}`), 500);
                }
            }
        }, delay);
    }

    function updateKeyboardColor(letter, color) {
        let buttons = document.querySelectorAll(".keyboard-row button");
        for (let btn of buttons) {
            if (btn.getAttribute("data-key") === letter) {
                let currentState = btn.getAttribute("data-state");
                // Precedence: correct > present > absent
                if (currentState === "correct") return;
                if (currentState === "present" && color === "absent") return;

                btn.setAttribute("data-state", color);
                btn.classList.remove("key-correct", "key-present", "key-absent");
                btn.classList.add("key-" + color);
                break;
            }
        }
    }

    function showMessage(msg) {
        gameMessage.innerHTML = msg;
        gameMessage.classList.add("show");

        setTimeout(() => {
            gameMessage.classList.remove("show");
        }, 2500);
    }

    function showEndOverlay(msg) {
        const overlayTitle = startOverlay.querySelector("h2");
        if (overlayTitle) overlayTitle.textContent = msg;
        const overlayBtn = startOverlay.querySelector(".start-btn");
        if (overlayBtn) overlayBtn.textContent = "Նոր Խաղ";
        startOverlay.classList.remove("hidden");
        isGameStarted = false;
    }

    function resetGame() {
        board.innerHTML = "";
        currentGuess = [];
        nextLetter = 0;
        guessesRemaining = maxGuesses;
        isGameOver = false;
        isChecking = false;
        targetWord = getNewWord(wordLength);
        console.log("Target word:", targetWord);

        document.querySelectorAll(".keyboard-row button").forEach(btn => {
            btn.removeAttribute("data-state");
            btn.classList.remove("key-correct", "key-present", "key-absent");
        });

        initBoard();
    }

    const startBtn = document.getElementById("start-wordle-btn");
    const startOverlay = document.getElementById("wordle-start-overlay");
    const levelSelect = document.getElementById("wordle-level-select");

    if (startBtn && startOverlay) {
        startBtn.addEventListener("click", (e) => {
            if (levelSelect) {
                wordLength = Number(levelSelect.value) || 5;
            }
            resetGame();
            startOverlay.classList.add("hidden");
            isGameStarted = true;
            e.currentTarget.blur();
        });
    } else {
        isGameStarted = true;
    }

    // Physical keyboard listener
    document.addEventListener("keydown", (e) => {
        // Ignore if typing in an input (already handled by index.js)
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        // Ignore modifier keys
        if (e.ctrlKey || e.altKey || e.metaKey) return;

        handleInput(e.key);

        // Prevent default behavior for game-controlled keys
        if (e.key === 'Enter' || e.key === 'Backspace' || e.key === ' ') {
            e.preventDefault();
        }
    });

    initBoard();
    initKeyboard();
});
