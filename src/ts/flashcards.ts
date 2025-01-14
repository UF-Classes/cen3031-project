import {Editor, MarkdownFileInfo, MarkdownView, Modal, Notice, Plugin, setIcon, Setting} from "obsidian";
import {SerializedFlashcardSet} from "./settings";
import Communities from "./main";
import {user} from "./globals";
import {FlashcardWriteGame, VIEW_TYPE_FLASHCARD_WRITE_GAME} from "./flashcard-games/write";

export class FlashcardSet {
    id: number;  // Unix time created

    constructor(public name: string, public flashcards: Array<Array<string>>, id: number = -1) {  // [front, back]
        if (id === -1) {
            this.id = Date.now();
        }
    }
}

export class FlashcardSetModal extends Modal {
    private flashcardContainerEl: HTMLDivElement;

    constructor(private plugin: Plugin, public flashcardSet: FlashcardSet) {
        super(plugin.app);
        this.setTitle(`Editing Flashcard Set: ${flashcardSet.name}`);

        new Setting(this.contentEl)
            .setName("Flashcard Set Name")
            .addText((text) => {
                text.setValue(flashcardSet.name);
                text.onChange((value) => {
                    flashcardSet.name = value;
                    this.setTitle(`Editing Flashcard Set: ${flashcardSet.name}`);
                });
            });
        new Setting(this.contentEl)
            .setName("Share Flashcard Set")
            .addButton((button) => {
                button
                    .setCta()
                    .setIcon("share")
                    .onClick(() => {
                        new FlashcardsShareModal(plugin, flashcardSet).open();
                    });
            });
        this.contentEl.createEl("h4", {text: "Study Games"});
        new Setting(this.contentEl)
            .setName("Write Game")
            .addButton((button) => {
                button
                    .setCta()
                    .setIcon("gamepad-2")
                    .onClick(() => {
                        Flashcards.instance.openWriteGame(flashcardSet);
                        this.close();
                    });
                button.buttonEl.title = "Study flashcards by writing the answer.";
            });
        this.contentEl.createEl("h4", {text: "Flashcards"});
        this.flashcardContainerEl = this.contentEl.createEl("div", {cls: "flashcards__container"});

        for (let i = 0; i < flashcardSet.flashcards.length; i++) {
            this.createFlashcardInserter();
            this.createFlashcardSettingEl(flashcardSet.flashcards[i]);
        }
        this.createFlashcardInserter();
    }

    createFlashcardSettingEl(flashcardData: Array<string>) {
        let [front, back] = flashcardData;
        const setting = new Setting(this.flashcardContainerEl)
            .setClass("flashcard--edit")
            .addText((text) => {
                text.setValue(front);
                text.onChange((value) => {
                    flashcardData[0] = value;
                });
            })
            .addTextArea((text) => {
                text.setValue(back);
                setTimeout(() => {
                    text.inputEl.style.height = text.inputEl.scrollHeight + 'px';
                }, 0);
                text.onChange((value) => {
                    flashcardData[1] = value;
                });
            })
            .addButton((button) => {  // Remove flashcard button
                button
                    .setIcon("trash-2")
                    .setCta()
                    .onClick(() => {
                        const inserter = setting.settingEl.previousElementSibling as HTMLElement;
                        inserter.remove();
                        this.flashcardSet.flashcards.splice(this.flashcardSet.flashcards.indexOf(flashcardData), 1);
                        setting.settingEl.remove();
                    });
            });
        const settingEl = setting.settingEl as HTMLElement & {flashcardData: Array<string>};
        settingEl.flashcardData = flashcardData;
        return setting;
    }

    createFlashcardInserter() {
        const button = this.flashcardContainerEl.createEl("button", {
            cls: "flashcards__insert"
        });
        setIcon(button, "circle-plus");
        button.addEventListener("click", () => {
            const prevFlashcardEl = button.previousElementSibling as HTMLElement & {flashcardData: Array<string>};
            const idx = prevFlashcardEl ? this.flashcardSet.flashcards.indexOf(prevFlashcardEl.flashcardData) + 1 : 0;
            this.flashcardSet.flashcards.splice(idx, 0, ["", ""]);
            const newInserter = this.createFlashcardInserter();
            const flashcardEl = this.createFlashcardSettingEl(this.flashcardSet.flashcards[idx]).settingEl;
            this.flashcardContainerEl.insertBefore(flashcardEl, button);
            this.flashcardContainerEl.insertBefore(newInserter, flashcardEl);
            // Scroll to new flashcard
            if (flashcardEl.offsetTop + flashcardEl.clientHeight > this.modalEl.scrollTop + this.modalEl.clientHeight) {
                const nextInserter = flashcardEl.nextElementSibling as HTMLElement;
                this.modalEl.scrollTo({
                    top: nextInserter.offsetTop + nextInserter.clientHeight - this.modalEl.clientHeight,
                    behavior: "smooth"
                });
            }
        });
        return button;
    }

    onClose() {
        if (Flashcards.instance.options.onSetSaved)
            Flashcards.instance.options.onSetSaved(this.flashcardSet);
    }
}

export class AllFlashcardsModal extends Modal {
    constructor(private plugin: Plugin, private flashcardSets: Array<SerializedFlashcardSet>) {
        super(plugin.app);
        this.setTitle("All Flashcard Sets");

        this.contentEl.createEl("h4", {text: "Flashcard Sets"});
        for (const flashcardSet of flashcardSets) {
            const setting = new Setting(this.contentEl)
                .setName(flashcardSet.name)
                .setDesc(flashcardSet.flashcards.length + " flashcards, created " + new Date(flashcardSet.id).toLocaleString())
                .addButton((button) => {
                    button
                        .setIcon("pencil")
                        .setCta()
                        .onClick(() => {
                            Flashcards.instance.openFlashcardEditorModal(flashcardSet as FlashcardSet);
                        });
                })
                .addButton((button) => {
                   button
                      .setIcon("trash-2")
                      .setCta()
                      .onClick(() => {
                          // Prompt confirmation


                          if (Flashcards.instance.options.onSetDeleted)
                              Flashcards.instance.options.onSetDeleted(flashcardSet as FlashcardSet);
                          setting.settingEl.remove();
                      });
                })
                .addButton((button) => {
                    button
                        .setIcon("share")
                        .setCta()
                        .onClick(() => {
                            new FlashcardsShareModal(plugin, flashcardSet as FlashcardSet).open();
                        });
                });
        }
    }
}

class FlashcardsShareModal extends Modal {
    private selectedCommunityId: string;

    constructor(private plugin: Plugin, private flashcardSet: FlashcardSet) {
        super(plugin.app);
        this.setTitle(`Share Flashcard Set: ${flashcardSet.name}`);
        if (user.id === "") {
            this.setContent("Please log in to share flashcard sets.");
            return;
        }
        this.setContent("Retrieving your communities...");
        fetch(`http://127.0.0.1:8000/communities/user/${user.id}`, {
            method: "GET",
            headers: {
                'Authorization': `Bearer ${user.token}`
            },
        }).then(res => res.json()).then((communities) => {
            this.render(communities);
        }).catch((err) => {
            this.setContent("Failed to retrieve your communities. Please try again later.");
        });
    }

    async render(communities: Array<{id: string, name: string}>) {
        this.contentEl.empty();
        if (communities.length == 0) {
            this.setContent("You are not a member of any communities. Join a community to share content with them.");
            return;
        }
        this.selectedCommunityId = communities[0].id;
        new Setting(this.contentEl)
            .setName("Select Community:")
            .addDropdown((dropdown) => {
                for (const community of communities) {
                    dropdown.addOption(community.id, community.name);
                }
                dropdown.onChange((value) => {
                    this.selectedCommunityId = value;
                });
            });
        new Setting(this.contentEl)
            .setName("Share Flashcard Set")
            .addButton((button) => {
                button
                    .setCta()
                    .setIcon("share")
                    .onClick(() => {
                        this.onSubmit();
                    });
            });
    }

    onSubmit() {
        fetch(`http://127.0.0.1:8000/flashcards/upload/community/${this.flashcardSet.name}/${this.selectedCommunityId}`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${user.token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                flashcards: this.flashcardSet.flashcards,
            }),
        }).then((res) => {
            if (res.status == 200) {
                new Notice("Flashcard set shared successfully.");
                this.close();
            } else {
                this.setContent("Failed to share flashcard set. Please try again later.");
            }
        });
    }
}

interface FlashcardsOptions {
    serializedFlashcardSets: Array<SerializedFlashcardSet>;
    onSetSaved?: (flashcardSet: FlashcardSet) => void;
    onSetDeleted?: (flashcardSet: FlashcardSet) => void;
}

export default class Flashcards {
    static instance: Flashcards;

    constructor(private plugin: Plugin, public options: FlashcardsOptions) {
        if (Flashcards.instance) {
            return Flashcards.instance;
        }
        Flashcards.instance = this;

        plugin.registerView(VIEW_TYPE_FLASHCARD_WRITE_GAME, (leaf) => new FlashcardWriteGame(leaf));

        plugin.addCommand({
            id: "create-flashcard-set",
            name: "Create Flashcard Set",
            editorCallback: this.onCreateFlashcardSetCommand.bind(this),
        });

        plugin.addCommand({
            id: "view-all-flashcard-sets",
            name: "View All Flashcard Sets",
            callback: () => {
                new AllFlashcardsModal(plugin, options.serializedFlashcardSets).open();
            }
        })
    }

    onCreateFlashcardSetCommand(editor: Editor, _: MarkdownView | MarkdownFileInfo) {
        let selectedText = editor.getSelection();
        if (!selectedText) {
            this.openFlashcardEditorModal(new FlashcardSet("My Flashcard Set", [["", ""]]));
            return;
        }
        // Parse selectedText into flashcards
        const flashcards: Array<Array<string>> = [];
        // const regex = /(\w.*):(.+)(?:$|\n)/;
        const regex = /((\w.*):((?:.(?!:)|\n)+))\n.+:/;
        const lastCardRegex = /((\w.*):((?:.|\n)+))(?:\n|$)/
        while (true) {
            let match = regex.exec(selectedText);
            if (!match) {
                match = lastCardRegex.exec(selectedText);
                if (!match)
                    break;
            }
            flashcards.push([match[2].trim(), match[3].trim()]);
            selectedText = selectedText.slice(match.index + match[1].length);
        }
        this.openFlashcardEditorModal(new FlashcardSet("My Flashcard Set", flashcards));
        return;
    }

    openFlashcardEditorModal(flashcardSet: FlashcardSet) {
        const modal = new FlashcardSetModal(this.plugin, flashcardSet);
        modal.open();
    }

    async openWriteGame(flashcardSet: FlashcardSet) {
        const { workspace } = this.plugin.app;
        let leaf = workspace.getLeaf("tab");
        await leaf.setViewState({
            type: VIEW_TYPE_FLASHCARD_WRITE_GAME,
            active: true
        });
        await workspace.revealLeaf(leaf);
        (leaf.view as FlashcardWriteGame).loadFlashcardSet(flashcardSet);
    }
}