import {SocketConfig, logger} from '../conf/config.js';

/**
 * This class implements a new Debate and the communication with the clients.
 */
export class Debate {
    static nb_debate = 0;
    debateID;
    adminRoomName;
    adminRoom;
    userNamespace;
    title;
    description;
    questions;
    admin;

    /**
     * Nested class Question that contains the question of the debate
     * @type {Debate.Question}
     */
    Question = class Question {
        static nb_question = 0;
        id;
        title;
        answers;
        isOpenQuestion;

        constructor(title, answers, isOpenQuestion = false) {
            this.id = ++Question.nb_question;
            this.title = title;
            this.isOpenQuestion = isOpenQuestion;

            if (answers == null) {
                this.answers = [];
            } else {
                if (isOpenQuestion) {
                    this.answers = answers.map(a => ({uuid: a.uuid, answer: a.answer}));
                } else {
                    this.answers = answers.map(a => ({answer: a}));
                }
            }
        }

        /**
         * Format the question by sending only answers
         * @returns {{answers: String[], id: int, isOpenQuestion: boolean, title: String}}
         */
        format() {
            return {
                id: this.id,
                title: this.title,
                answers: this.answers.map(a => (a.answer)),
                isOpenQuestion: this.isOpenQuestion
            }
        }
    };

    /**
     * Create a new debate
     * @param title of the debate
     * @param description of the debate
     * @param ownerSocket socket of the debate creator
     * @param io Socket.io server
     * @param adminNamespace admin namespace to create the room communicate with the admins
     */
    constructor(title, description, ownerSocket, io, adminNamespace) {
        this.title = title;
        this.description = description;
        this.questions = new Map();
        this.debateID = ++Debate.nb_debate;
        this.adminRoomName = SocketConfig.ADMIN_ROOM_PREFIX + this.debateID;
        this.adminRoom = adminNamespace.to(this.adminRoomName);
        this.admin = ownerSocket.username;
        //For local tests
        //this.admin = "admin";

        // Join the admin room
        ownerSocket.join(this.adminRoomName);

        // Create a new namespace for the debate
        this.userNamespace = io.of(SocketConfig.DEBATE_NAMESPACE_PREFIX + this.debateID);
    }

    /**
     * Starts handling for client events.
     */
    startSocketHandling() {
        this.userNamespace.on('connection', (socket) => {
            logger.debug(`New socket connected to namespace ${this.userNamespace.name} + ${socket.id}`);

            // Register socket functions
            socket.on('getQuestions', this.getQuestions(socket));
            socket.on('answerQuestion', this.answerQuestion(socket));
            socket.on('answerOpenQuestion', this.answerOpenQuestion(socket));
        });
    }

    /**
     * Register a new question to the debate and transmit it to the clients.
     * @param question object from the nested class Question
     */
    sendNewQuestion(question) {
        logger.debug(`Sending new question with id ${question.id}`);
        this.questions.set(question.id, question);
        this.userNamespace.emit('newQuestion', question.format());
    }

    // This section contains the different socket io functions

    /**
     * Return the list of questions to the callback function
     */
    getQuestions = (socket) => (callback) => {
        logger.debug(`getQuestions received from ${socket.id}`);

        if (!(callback instanceof Function)) {
            logger.debug(`callback is not a function.`);
            return;
        }

        // Format the questions before sending them
        callback(Array.from(this.questions.values(), q => (q.format())));
    };

    /**
     * Register a new answer to a question of the debate.
     * questionAnswer contains questionId and answerId
     * callback is a function that takes true on success, otherwise false.
     */
    answerQuestion = (socket) => (questionAnswer, callback) => {
        logger.debug(`answerQuestion received from ${socket.id}`);

        if (!(callback instanceof Function)) {
            logger.debug(`callback is not a function.`);
            return;
        }

        const questionId = questionAnswer.questionId;
        const answerId = questionAnswer.answerId;
        if (questionId == null || answerId == null) {
            logger.debug("questionId or answerId is null.");
            callback(false);
            return;
        }

        const question = this.questions.get(questionId);
        if (question == null) {
            logger.debug(`Question with id (${questionId}) not found.`);
            callback(false);
            return;
        }

        if (answerId >= question.answers.length) {
            logger.debug(`Question (${questionId}) with answer (${answerId}) invalid.`);
            callback(false);
            return;
        }

        logger.info(`Socket (${socket.id}) replied ${answerId} to question (${questionId}).`);

        // Send the reply to the admin room.
        this.adminRoom.emit('questionAnswered', {questionId: questionId, answerId: answerId});
        callback(true);
    };

    /**
     * Register a new answer to an open question of the debate.
     * questionAnswer contains questionId and the answer
     * callback is a function that takes true on success, otherwise false.
     */
    answerOpenQuestion = (socket) => (questionAnswer, callback) => {
        logger.debug(`answerOpenQuestion received from ${socket.id}`);

        if (!(callback instanceof Function)) {
            logger.debug(`callback is not a function.`);
            return;
        }

        const questionId = questionAnswer.questionId;
        const answer = questionAnswer.answer;
        if (questionId == null || answer == null) {
            logger.debug("questionId or answer is null.");
            callback(false);
            return;
        }

        const question = this.questions.get(questionId);
        if (question == null) {
            logger.debug(`Question with id (${questionId}) not found.`);
            callback(false);
            return;
        }

        if (!question.isOpenQuestion) {
            logger.debug(`Question with id (${questionId}) is not an open question.`);
            callback(false);
            return;
        }

        question.answers.push({answer: answer, uuid: socket.uuid});
        logger.info(`Socket (${socket.id}) replied (${answer}) to question (${questionId}).`);
        callback(true);
    };
}
