const mongoose = require('mongoose');

process.env.TWILIO_ACCOUNT_SID = 'TEST_SID';
process.env.TWILIO_AUTH_TOKEN = 'TEST_TOKEN';
process.env.TWILIO_WHATSAPP_NUMBER = 'whatsapp:+11111111111';

const whatsappService = require('../utils/whatsappService');
const MessageTemplate = require('../models/MessageTemplate');

// Mock Twilio
jest.mock('twilio', () => {
  return jest.fn().mockImplementation(() => {
    return {
      messages: {
        create: jest.fn().mockResolvedValue({ sid: 'TEST_SID_123' })
      }
    };
  });
});

describe('WhatsApp Service Unit Tests', () => {

  beforeAll(async () => {
      // Stub Mongoose connect if needed, but we intercept the db calls here
      jest.spyOn(MessageTemplate, 'findOne').mockImplementation(async ({ type }) => {
          if (type === 'PaymentConfirmation') {
              return { type: 'PaymentConfirmation', text: 'Hello {{name}} your payment of {{amount}} is confirmed.', mediaUrl: 'http://test.jpg' };
          }
          if (type === 'DueReminder') {
              return { type: 'DueReminder', text: 'Hey {{name}} you owe {{amount}}.' };
          }
          return null;
      });
  });

  afterAll(() => {
      jest.restoreAllMocks();
  });

  test('sendPaymentConfirmation should format and return true when successful', async () => {
      const mockPayment = {
          _id: new mongoose.Types.ObjectId(),
          amount: 5000,
          person: { name: 'Aftab' }
      };

      const result = await whatsappService.sendPaymentConfirmation(mockPayment, '+923000000000');
      expect(result).toBe(true);
  });

  test('sendDueReminder should format without media and return true', async () => {
      const mockPayment = {
          _id: new mongoose.Types.ObjectId(),
          amount: 1500,
          person: { name: 'Ali' }
      };

      const result = await whatsappService.sendDueReminder(mockPayment, '03000000000');
      expect(result).toBe(true);
  });

  test('should return false if template is not found', async () => {
      const mockPayment = { _id: new mongoose.Types.ObjectId(), amount: 500 };
      const result = await whatsappService.sendWeeklyReminder(mockPayment, '+1234567890');
      expect(result).toBe(false); 
      // WeeklyReminder is not stubbed in beforeAll, so it returns null and service should return false
  });

});
