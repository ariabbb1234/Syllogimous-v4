import { Component } from '@angular/core';
import { SyllogimousService } from '../../services/syllogimous.service';
import { StatsService } from '../../services/stats.service';
import { LS_GAME_MODE, LS_TEST_MODE, LS_TIMER } from '../../constants/local-storage.constants';
import { LS_CUSTOM_TIMERS_KEY } from '../settings/modal-timer-settings/modal-timer-settings.component';
import { Router } from '@angular/router';
import { EnumScreens } from '../../constants/syllogimous.constants';
import { GameTimerService } from '../../services/game-timer.service';
import { ProgressAndPerformanceService } from '../../services/progress-and-performance.service';

@Component({
    selector: 'app-game',
    templateUrl: './game.component.html',
    styleUrls: ['./game.component.css']
})
export class GameComponent {
    Array = Array;

    timerType;
    gameMode;
    timerTimeSeconds = 0;
    trueButtonToTheRight = false;
    testMode = false;
    passLength = 0;
    maxPasses = 0;
    answeredInPass = 0;
    passesCompleted = 0;

    constructor(
        public sylSrv: SyllogimousService,
        public gameTimerService: GameTimerService,
        private statsService: StatsService,
        private router: Router,
        private progressAndPerformanceService: ProgressAndPerformanceService,
    ) {
        this.timerType = localStorage.getItem(LS_TIMER) || '0';
        this.gameMode = localStorage.getItem(LS_GAME_MODE) || '0';
        this.trueButtonToTheRight = Math.random() > 0.5;

        this.testMode = localStorage.getItem(LS_TEST_MODE) === '1';
        if (this.testMode) {
            const { passLength, maxPasses } = this.progressAndPerformanceService.getPassSettings();
            this.passLength = passLength;
            this.maxPasses = maxPasses;
        }

        if (this.sylSrv.question.conclusion === "!") {
            this.router.navigate([EnumScreens.Start]);
        }
    }

    ngOnInit() {
        this.setupTimer();
    }

    ngOnDestroy() {
        this.gameTimerService.stop();
    }

    kickTimer = async () => {
        await this.gameTimerService.start(this.timerTimeSeconds);
        await this.sylSrv.checkQuestion(undefined, this.testMode);

        if (this.testMode) {
            this.answeredInPass++;
            if (this.answeredInPass >= this.passLength) {
                this.answeredInPass = 0;
                this.passesCompleted++;
                this.router.navigate([EnumScreens.Feedback]);
            } else {
                this.loadNextQuestion();
            }
        }
    }

    async answer(value: boolean) {
        if (this.timerType !== '0') {
            this.gameTimerService.stop();
        }

        await this.sylSrv.checkQuestion(value, this.testMode);

        if (!this.testMode) {
            return;
        }

        this.answeredInPass++;

        if (this.answeredInPass >= this.passLength) {
            this.answeredInPass = 0;
            this.passesCompleted++;
            this.router.navigate([EnumScreens.Feedback]);
        } else {
            this.loadNextQuestion();
        }
    }

    loadNextQuestion() {
        this.sylSrv.question = this.sylSrv.createRandomQuestion();
        this.trueButtonToTheRight = Math.random() > 0.5;
        this.setupTimer();
    }

    setupTimer() {
        switch(this.timerType) {
            case '1': {
                console.log("Custom timer");

                const customTimers = JSON.parse(localStorage.getItem(LS_CUSTOM_TIMERS_KEY) || "{}");
                this.timerTimeSeconds = customTimers[this.sylSrv.question.type] || 90;
                this.kickTimer();

                break;
            }
            case '2': {
                console.log("Adaptive timer");

                const correctRate = 0.5;
                const incorrectRate = 1;
                const timeoutRate = 1.5;
                const newLevelBonus = 15;
                const negationBonus = 3;
                const metaRelationBonus = 4;
                this.timerTimeSeconds = 90;

                const questionType = this.sylSrv.question.type;
                const questionPremises = this.sylSrv.question.premises.length;
                const { typeBasedStats } = this.statsService.calcStats(this.timerType);
                const tbs = typeBasedStats[questionType];

                if (tbs?.stats) {
                    const prevStats = (tbs.stats as any)[questionPremises - 1];
                    const currStats = (tbs.stats as any)[questionPremises];

                    let avgTimeToRespond = this.timerTimeSeconds;
                    if (currStats && currStats.count > 2) {
                        avgTimeToRespond = (currStats.last10Sum / 1000) / (currStats.last10Count || 1);
                        avgTimeToRespond -= correctRate * currStats.last10Correct;
                        avgTimeToRespond += incorrectRate * currStats.last10Incorrect;
                        avgTimeToRespond += timeoutRate * currStats.last10Timeout;
                    } else if (prevStats && prevStats.count > 2) {
                        avgTimeToRespond = (prevStats.last10Sum / 1000) / (prevStats.last10Count || 1);
                        avgTimeToRespond -= correctRate * prevStats.last10Correct;
                        avgTimeToRespond += incorrectRate * prevStats.last10Incorrect;
                        avgTimeToRespond += timeoutRate * prevStats.last10Timeout;
                        avgTimeToRespond += newLevelBonus; // Bonus for the new level
                    }

                    avgTimeToRespond += negationBonus * this.sylSrv.question.negations;
                    avgTimeToRespond += metaRelationBonus * this.sylSrv.question.metaRelations;

                    this.timerTimeSeconds = Math.floor(Math.max(0, avgTimeToRespond));
                }

                this.kickTimer();

                break;
            }
            default: {
                console.log("No timer");
            }
        }
    }
}
